import Anthropic from '@anthropic-ai/sdk';
import { inngest } from '@/lib/inngest/client';
import { anthropic } from '@/lib/ai/client';
import { getPresignedGetUrl } from '@/lib/r2';
import { geocode } from '@/lib/mapbox/client';
import { getBookingById, updateBooking } from '@/lib/db/repositories/bookings';
import { createSegment, segmentExistsForBooking } from '@/lib/db/repositories/segments';
import { classifierSystemPrompt, classifierUserPrompt } from '@/lib/ai/prompts/classifier';
import { flightSystemPrompt, flightUserPrompt } from '@/lib/ai/prompts/flight';
import { hotelSystemPrompt, hotelUserPrompt } from '@/lib/ai/prompts/hotel';
import {
  FlightExtractionSchema,
  FlightDetailsSchema,
  type FlightExtraction,
} from '@/lib/ai/schemas/flight';
import {
  HotelExtractionSchema,
  HotelDetailsSchema,
  type HotelExtraction,
} from '@/lib/ai/schemas/hotel';

export const parseBookingFunction = inngest.createFunction(
  { id: 'parse-booking', name: 'Parse Booking', triggers: [{ event: 'booking/uploaded' }] },
  async ({ event, step }) => {
    const { bookingId } = event.data as { bookingId: string };

    try {
      // ── Step 1: Classify ────────────────────────────────────────────────────
      const { bookingType } = await step.run('classify', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        const fileUrl = await getPresignedGetUrl(booking.fileKey);

        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 10,
          system: classifierSystemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'document', source: { type: 'url', url: fileUrl } },
                { type: 'text', text: classifierUserPrompt(booking.fileName) },
              ],
            },
          ],
        });

        const firstBlock = message.content[0];
        const raw =
          firstBlock?.type === 'text' ? firstBlock.text.trim().toLowerCase() : 'unknown';
        const bookingType =
          raw === 'flight' ? ('flight' as const) :
          raw === 'hotel'  ? ('hotel' as const) :
                             ('unknown' as const);

        if (bookingType === 'unknown') {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: "We couldn't identify this document as a flight or hotel booking.",
          });
          return { bookingType: 'unknown' as const };
        }

        await updateBooking(bookingId, { type: bookingType });
        return { bookingType };
      });

      if (bookingType === 'unknown') return { status: 'unknown_document' };

      // ── Step 2: Extract ─────────────────────────────────────────────────────
      const extractionResult = await step.run('extract', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        const fileUrl = await getPresignedGetUrl(booking.fileKey);

        const isHotel = bookingType === 'hotel';
        const schema = isHotel ? HotelExtractionSchema : FlightExtractionSchema;
        const toolName = isHotel ? 'record_hotel_booking' : 'record_flight_booking';
        const systemPrompt = isHotel ? hotelSystemPrompt : flightSystemPrompt;
        const userPrompt = isHotel
          ? hotelUserPrompt(booking.fileName)
          : flightUserPrompt(booking.fileName);

        const inputSchema = schema.toJSONSchema() as Anthropic.Tool['input_schema'];

        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          tools: [{ name: toolName, description: `Record ${bookingType} booking details`, input_schema: inputSchema }],
          tool_choice: { type: 'tool', name: toolName },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'document', source: { type: 'url', url: fileUrl } },
                { type: 'text', text: userPrompt },
              ],
            },
          ],
        });

        const toolBlock = message.content.find(
          (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use',
        );
        if (!toolBlock) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: 'The AI did not return extraction results.',
          });
          return null;
        }

        const parsed = schema.safeParse(toolBlock.input);
        if (!parsed.success) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: 'The AI extracted data in an unexpected format.',
          });
          return null;
        }

        await updateBooking(bookingId, {
          rawAiOutput: toolBlock.input as Record<string, unknown>,
        });
        return parsed.data;
      });

      if (!extractionResult) return { status: 'extraction_failed' };

      // ── Step 3: Geocode ─────────────────────────────────────────────────────
      const coords = await step.run('geocode', async () => {
        if (bookingType === 'flight') {
          const data = extractionResult as FlightExtraction;
          const [startCoords, endCoords] = await Promise.all([
            geocode(`${data.departure_airport_code} airport`),
            geocode(`${data.arrival_airport_code} airport`),
          ]);
          return {
            startLat: startCoords ? String(startCoords.lat) : null,
            startLng: startCoords ? String(startCoords.lng) : null,
            endLat: endCoords ? String(endCoords.lat) : null,
            endLng: endCoords ? String(endCoords.lng) : null,
          };
        } else {
          const data = extractionResult as HotelExtraction;
          const hotelCoords = await geocode(data.address);
          const latStr = hotelCoords ? String(hotelCoords.lat) : null;
          const lngStr = hotelCoords ? String(hotelCoords.lng) : null;
          return { startLat: latStr, startLng: lngStr, endLat: latStr, endLng: lngStr };
        }
      });

      // ── Step 4: Write ───────────────────────────────────────────────────────
      const { segmentId } = await step.run('write', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        const alreadyExists = await segmentExistsForBooking(bookingId);

        if (!alreadyExists) {
          if (bookingType === 'flight') {
            const data = extractionResult as FlightExtraction;
            const details = FlightDetailsSchema.parse(data);
            const segment = await createSegment({
              bookingId,
              tripId: booking.tripId,
              type: 'flight',
              startTime: new Date(data.departure_iso),
              startTimezone: data.departure_timezone,
              endTime: new Date(data.arrival_iso),
              endTimezone: data.arrival_timezone,
              startLocation: data.departure_airport_label,
              startLat: coords.startLat,
              startLng: coords.startLng,
              endLocation: data.arrival_airport_label,
              endLat: coords.endLat,
              endLng: coords.endLng,
              details,
            });
            await updateBooking(bookingId, { status: 'parsed' });
            return { segmentId: segment.id };
          } else {
            const data = extractionResult as HotelExtraction;
            const details = HotelDetailsSchema.parse(data);
            const segment = await createSegment({
              bookingId,
              tripId: booking.tripId,
              type: 'hotel_stay',
              startTime: new Date(data.check_in_iso),
              startTimezone: data.timezone,
              endTime: new Date(data.check_out_iso),
              endTimezone: data.timezone,
              startLocation: data.address,
              startLat: coords.startLat,
              startLng: coords.startLng,
              endLocation: data.address,
              endLat: coords.endLat,
              endLng: coords.endLng,
              details,
            });
            await updateBooking(bookingId, { status: 'parsed' });
            return { segmentId: segment.id };
          }
        }

        await updateBooking(bookingId, { status: 'parsed' });
        return { segmentId: null };
      });

      return { status: 'parsed', segmentId };
    } catch (err) {
      await updateBooking(bookingId, {
        status: 'parsing_failed',
        parseError: 'Something went wrong while parsing your document.',
      });
      throw err;
    }
  },
);
