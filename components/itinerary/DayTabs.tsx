'use client';

import { Button } from '@/components/ui/button';

export function DayTabs({
  days,
  selectedDay,
  onSelect,
}: {
  days: { date: string; label: string }[];
  selectedDay: string;
  onSelect: (date: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((day) => (
        <Button
          key={day.date}
          render={<button type="button" />}
          variant={selectedDay === day.date ? 'default' : 'outline'}
          onClick={() => onSelect(day.date)}
          className="text-xs"
        >
          {day.label}
        </Button>
      ))}
    </div>
  );
}
