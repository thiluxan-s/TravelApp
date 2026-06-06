// components/itinerary/ParsingBanner.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Booking } from '@/lib/db/schema';

export function ParsingBanner({ bookings }: { bookings: Booking[] }) {
  const router = useRouter();
  const inFlight = bookings.filter(
    (b) => b.status === 'parsing' || b.status === 'uploading',
  );

  useEffect(() => {
    if (inFlight.length === 0) return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [inFlight.length, router]);

  if (inFlight.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
      <span className="block h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
      Parsing {inFlight.length} booking{inFlight.length > 1 ? 's' : ''}… results will appear
      automatically
    </div>
  );
}
