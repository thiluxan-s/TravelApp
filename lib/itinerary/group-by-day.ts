import { DateTime } from 'luxon';
import type { Segment } from '@/lib/db/schema';
import type { DayGroup } from './types';
import { computeAnnotations } from './compute-annotations';

function localDate(instant: Date, zone: string): string {
  return DateTime.fromJSDate(instant, { zone }).toISODate()!;
}

/**
 * The local dates a stay covers as nights: check-in date through the date before
 * checkout. A stay checking out on the 14th does not cover the 14th — you are not
 * staying there the morning you leave, and the checkout time is on the card.
 * Returns [] for a same-day stay, which covers no nights at all.
 */
function coveredNights(stay: Segment): string[] {
  const zone = stay.startTimezone;
  const checkIn = DateTime.fromJSDate(stay.startTime, { zone }).startOf('day');
  const checkOut = DateTime.fromJSDate(stay.endTime, { zone }).startOf('day');

  const nights: string[] = [];
  for (let d = checkIn; d < checkOut; d = d.plus({ days: 1 })) {
    nights.push(d.toISODate()!);
  }
  return nights;
}

export function groupSegmentsByDay(segments: Segment[]): DayGroup[] {
  if (segments.length === 0) return [];

  const dayMap = new Map<string, Segment[]>();

  for (const segment of segments) {
    const date = localDate(segment.startTime, segment.startTimezone);
    const existing = dayMap.get(date);
    if (existing) {
      existing.push(segment);
    } else {
      dayMap.set(date, [segment]);
    }
  }

  // Which stay covers each night. Later check-ins win, so moving hotels
  // mid-trip resolves to where you actually are.
  const stays = segments
    .filter((s) => s.type === 'hotel_stay')
    .slice()
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const lodgingByDate = new Map<string, Segment>();
  for (const stay of stays) {
    for (const night of coveredNights(stay)) {
      lodgingByDate.set(night, stay);
      // A covered night with nothing else on it still deserves a day.
      if (!dayMap.has(night)) dayMap.set(night, []);
    }
  }

  const sortedDates = [...dayMap.keys()].sort();

  return sortedDates.map((date) => {
    // Callers flatten segments in booking-creation order, so sort within the day
    // before pairing — otherwise adjacent pairs come out reversed and
    // computeAnnotations reports a false overlap conflict.
    const segs = dayMap
      .get(date)!
      .slice()
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const stay = lodgingByDate.get(date) ?? null;
    // Suppress on the check-in day: the stay is already a card there.
    const lodging = stay && segs.some((s) => s.id === stay.id) ? null : stay;

    const zone = segs[0]?.startTimezone ?? stay?.startTimezone ?? 'UTC';
    const label = DateTime.fromISO(date, { zone }).toFormat('cccc, MMMM d');

    const annotations = segs
      .slice(0, -1)
      .map((seg, i) => computeAnnotations(seg, segs[i + 1]));

    return { date, label, segments: segs, annotations, lodging };
  });
}
