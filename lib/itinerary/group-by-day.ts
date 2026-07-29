import { DateTime } from 'luxon';
import type { Segment } from '@/lib/db/schema';
import type { DayGroup } from './types';
import { computeAnnotations } from './compute-annotations';

export function groupSegmentsByDay(segments: Segment[]): DayGroup[] {
  if (segments.length === 0) return [];

  const dayMap = new Map<string, Segment[]>();

  for (const segment of segments) {
    const date = DateTime.fromJSDate(segment.startTime, {
      zone: segment.startTimezone,
    }).toISODate()!;
    const existing = dayMap.get(date);
    if (existing) {
      existing.push(segment);
    } else {
      dayMap.set(date, [segment]);
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
    const label = DateTime.fromISO(date, { zone: segs[0].startTimezone }).toFormat(
      'cccc, MMMM d',
    );
    const annotations = segs
      .slice(0, -1)
      .map((seg, i) => computeAnnotations(seg, segs[i + 1]));
    return { date, label, segments: segs, annotations };
  });
}
