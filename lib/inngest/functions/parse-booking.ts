import Anthropic from '@anthropic-ai/sdk';
import { inngest } from '@/lib/inngest/client';
import { anthropic } from '@/lib/ai/client';
import { getPresignedGetUrl } from '@/lib/r2';
import { geocode } from '@/lib/mapbox/client';
import { getBookingById, updateBooking } from '@/lib/db/repositories/bookings';
import { createSegment, segmentExistsForBooking } from '@/lib/db/repositories/segments';
import { classifierSystemPrompt, classifierUserPrompt } from '@/lib/ai/prompts/classifier';
import { getBookingTypeHandler, type Coords } from '@/lib/ai/booking-types';

function fileContentBlock(
  mimeType: string,
  fileUrl: string,
): Anthropic.ContentBlockParam {
  return mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'url', url: fileUrl } }
    : { type: 'image', source: { type: 'url', url: fileUrl } };
}

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
                fileContentBlock(booking.mimeType, fileUrl),
                { type: 'text', text: classifierUserPrompt(booking.fileName) },
              ],
            },
          ],
        });

        const firstBlock = message.content[0];
        const raw =
          firstBlock?.type === 'text' ? firstBlock.text.trim().toLowerCase() : 'unknown';

        const handler = getBookingTypeHandler(raw);
        if (!handler) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: "We couldn't identify this document as a flight or hotel booking.",
          });
          return { bookingType: null };
        }

        await updateBooking(bookingId, { type: handler.bookingType });
        return { bookingType: handler.bookingType };
      });

      if (!bookingType) return { status: 'unknown_document' };

      // The handler is re-resolved per step: step results cross a serialization
      // boundary, so only the plain booking type travels between steps.
      const handler = getBookingTypeHandler(bookingType);
      if (!handler) throw new Error(`No handler registered for booking type ${bookingType}`);

      // ── Step 2: Extract ─────────────────────────────────────────────────────
      const extractionResult = await step.run('extract', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        const fileUrl = await getPresignedGetUrl(booking.fileKey);

        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: handler.systemPrompt,
          tools: [
            {
              name: handler.toolName,
              description: handler.toolDescription,
              input_schema: handler.inputJsonSchema(),
            },
          ],
          tool_choice: { type: 'tool', name: handler.toolName },
          messages: [
            {
              role: 'user',
              content: [
                fileContentBlock(booking.mimeType, fileUrl),
                { type: 'text', text: handler.userPrompt(booking.fileName) },
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

        if (!handler.isValidExtraction(toolBlock.input)) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: 'The AI extracted data in an unexpected format.',
          });
          return null;
        }

        await updateBooking(bookingId, {
          rawAiOutput: toolBlock.input as Record<string, unknown>,
        });
        return toolBlock.input as Record<string, unknown>;
      });

      if (!extractionResult) return { status: 'extraction_failed' };

      // ── Step 3: Geocode ─────────────────────────────────────────────────────
      const coords = await step.run('geocode', async (): Promise<Coords> => {
        const targets = handler.geocodeTargets(extractionResult);
        if (!targets) return { startLat: null, startLng: null, endLat: null, endLng: null };

        // One location (a hotel stay) — geocode once and reuse for both endpoints.
        if (targets.start === targets.end) {
          const point = await geocode(targets.start);
          const lat = point ? String(point.lat) : null;
          const lng = point ? String(point.lng) : null;
          return { startLat: lat, startLng: lng, endLat: lat, endLng: lng };
        }

        const [startPoint, endPoint] = await Promise.all([
          geocode(targets.start),
          geocode(targets.end),
        ]);
        return {
          startLat: startPoint ? String(startPoint.lat) : null,
          startLng: startPoint ? String(startPoint.lng) : null,
          endLat: endPoint ? String(endPoint.lat) : null,
          endLng: endPoint ? String(endPoint.lng) : null,
        };
      });

      // ── Step 4: Write ───────────────────────────────────────────────────────
      const result = await step.run('write', async () => {
        const booking = await getBookingById(bookingId);
        if (!booking) throw new Error(`Booking ${bookingId} not found`);

        if (await segmentExistsForBooking(bookingId)) {
          await updateBooking(bookingId, { status: 'parsed' });
          return { failed: false as const, segmentId: null };
        }

        const fields = handler.toSegmentFields(extractionResult, coords);
        if (!fields) {
          await updateBooking(bookingId, {
            status: 'parsing_failed',
            parseError: 'The AI extracted data in an unexpected format.',
          });
          return { failed: true as const };
        }

        const segment = await createSegment({
          ...fields,
          bookingId,
          tripId: booking.tripId,
        });
        await updateBooking(bookingId, { status: 'parsed' });
        return { failed: false as const, segmentId: segment.id };
      });

      if (result.failed) return { status: 'extraction_failed' };
      return { status: 'parsed', segmentId: result.segmentId };
    } catch (err) {
      await updateBooking(bookingId, {
        status: 'parsing_failed',
        parseError: 'Something went wrong while parsing your document.',
      });
      throw err;
    }
  },
);
