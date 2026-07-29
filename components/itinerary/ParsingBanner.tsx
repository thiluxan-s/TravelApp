// components/itinerary/ParsingBanner.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Booking } from '@/lib/db/schema';
import { summarizeBookingStatuses } from '@/lib/itinerary/booking-status';

export function ParsingBanner({ bookings }: { bookings: Booking[] }) {
  const router = useRouter();
  const { inFlight, failed } = summarizeBookingStatuses(bookings);

  useEffect(() => {
    if (inFlight === 0) return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [inFlight, router]);

  if (inFlight > 0) {
    return (
      <div role="status" className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
        <span className="block h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
        Parsing {inFlight} booking{inFlight > 1 ? 's' : ''}… results will appear
        automatically
        {failed > 0 && (
          <span> · <a href="#bookings" className="underline underline-offset-2">{failed} couldn&apos;t be read</a></span>
        )}
      </div>
    );
  }

  if (failed > 0) {
    return (
      <div role="alert" className="mb-4 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <span aria-hidden="true">⚠</span>
        <span>
          {failed} booking{failed > 1 ? 's' : ''} couldn&apos;t be read.{' '}
          <a href="#bookings" className="underline underline-offset-2">
            See what went wrong
          </a>
        </span>
      </div>
    );
  }

  return null;
}
