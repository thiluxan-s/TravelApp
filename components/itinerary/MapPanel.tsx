'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { DateTime } from 'luxon';
import type { Segment } from '@/lib/db/schema';
import { DayTabs } from './DayTabs';

// ssr: false prevents Mapbox GL JS from running on the server
const TripMap = dynamic(() => import('./TripMap').then((m) => ({ default: m.TripMap })), {
  ssr: false,
  loading: () => (
    <div className="flex-1 animate-pulse rounded-lg border border-border bg-muted" />
  ),
});

export function MapPanel({
  segments,
  days,
}: {
  segments: Segment[];
  days: { date: string; label: string }[];
}) {
  const [selectedDay, setSelectedDay] = useState(days[0]?.date ?? '');

  // Short label for tabs: "Mar 10" instead of "Tuesday, March 10"
  const tabDays = days.map((d) => ({
    date: d.date,
    label: DateTime.fromISO(d.date).toFormat('MMM d'),
  }));

  // Filter to segments whose local start date matches the selected day
  const daySegments = segments.filter((s) => {
    const localDate = DateTime.fromJSDate(s.startTime, { zone: s.startTimezone }).toISODate();
    return localDate === selectedDay;
  });

  if (days.length === 0) return null;

  return (
    <div className="flex h-full flex-col gap-2">
      <DayTabs days={tabDays} selectedDay={selectedDay} onSelect={setSelectedDay} />
      <div className="flex-1 overflow-hidden">
        <TripMap segments={daySegments} />
      </div>
    </div>
  );
}
