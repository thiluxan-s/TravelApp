import type { Segment } from '@/lib/db/schema';

export type DayGroup = {
  date: string;
  label: string;
  segments: Segment[];
  annotations: Annotation[];
  /**
   * The stay covering this night, or null. Deliberately NOT a member of
   * `segments`: as a regular member it would pair with the day's real events and
   * produce a gap measured from a hotel that started days ago. Null on the
   * check-in day, where the stay already renders as its own card.
   */
  lodging: Segment | null;
};

export type Annotation = {
  kind: 'gap' | 'conflict';
  gapMinutes: number;
  distanceKm: number | null;
  message: string;
  conflictDetail?: string;
};
