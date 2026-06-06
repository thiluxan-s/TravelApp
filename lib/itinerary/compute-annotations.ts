import { DateTime } from 'luxon';
import type { Segment } from '@/lib/db/schema';
import type { Annotation } from './types';
import { haversineKm } from './haversine';
import { HotelDetailsSchema } from '@/lib/ai/schemas/hotel';

export function computeAnnotations(prev: Segment, next: Segment): Annotation {
  const gapMinutes = Math.round(
    DateTime.fromJSDate(next.startTime)
      .diff(DateTime.fromJSDate(prev.endTime), 'minutes')
      .minutes,
  );

  const prevLat = prev.endLat != null ? parseFloat(prev.endLat) : null;
  const prevLng = prev.endLng != null ? parseFloat(prev.endLng) : null;
  const nextLat = next.startLat != null ? parseFloat(next.startLat) : null;
  const nextLng = next.startLng != null ? parseFloat(next.startLng) : null;
  const distanceKm =
    prevLat != null && prevLng != null && nextLat != null && nextLng != null
      ? haversineKm(prevLat, prevLng, nextLat, nextLng)
      : null;

  // Conflict: time overlap
  if (next.startTime < prev.endTime) {
    return {
      kind: 'conflict',
      gapMinutes,
      distanceKm,
      message: 'These bookings overlap in time',
      conflictDetail: 'Two events are scheduled at the same time.',
    };
  }

  // Conflict: flight lands after hotel check-in closes
  if (prev.type === 'flight' && next.type === 'hotel_stay') {
    const parsed = HotelDetailsSchema.safeParse(next.details);
    if (parsed.success && parsed.data.check_in_time) {
      const [closeHour, closeMin] = parsed.data.check_in_time.split(':').map(Number);
      const arrivalLocal = DateTime.fromJSDate(prev.endTime, { zone: next.startTimezone });
      const arrivesAfterClose =
        arrivalLocal.hour > closeHour ||
        (arrivalLocal.hour === closeHour && arrivalLocal.minute > (closeMin ?? 0));
      if (arrivesAfterClose) {
        const phone = parsed.data.phone;
        const phoneMsg = phone ? ` Call ahead: ${phone}` : '';
        return {
          kind: 'conflict',
          gapMinutes,
          distanceKm,
          message: `Check-in closes at ${parsed.data.check_in_time} — your flight lands at ${arrivalLocal.toFormat('HH:mm')}`,
          conflictDetail: `Hotel check-in window may be closed on arrival.${phoneMsg}`,
        };
      }
    }
  }

  // Conflict: hotel checkout < 90 min before flight
  if (prev.type === 'hotel_stay' && next.type === 'flight' && gapMinutes < 90) {
    return {
      kind: 'conflict',
      gapMinutes,
      distanceKm,
      message: `Only ${gapMinutes} min between check-out and departure`,
      conflictDetail: 'Less than 90 minutes is tight for airport travel.',
    };
  }

  // Normal gap
  return {
    kind: 'gap',
    gapMinutes,
    distanceKm,
    message: buildGapMessage(gapMinutes, distanceKm),
  };
}

function buildGapMessage(gapMinutes: number, distanceKm: number | null): string {
  const abs = Math.abs(gapMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const timeStr =
    hours > 0 && mins > 0
      ? `${hours}h ${mins}m`
      : hours > 0
        ? `${hours}h`
        : `${mins}m`;
  return distanceKm != null ? `${timeStr} · ~${distanceKm} km` : timeStr;
}
