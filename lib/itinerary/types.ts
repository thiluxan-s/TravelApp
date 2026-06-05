import type { Segment } from '@/lib/db/schema';

export type DayGroup = {
  date: string;
  label: string;
  segments: Segment[];
  annotations: Annotation[];
};

export type Annotation = {
  kind: 'gap' | 'conflict';
  gapMinutes: number;
  distanceKm: number | null;
  message: string;
  conflictDetail?: string;
};
