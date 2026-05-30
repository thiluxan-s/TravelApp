'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookingCard } from '@/components/trips/BookingCard';
import { BookingUploader } from '@/components/trips/BookingUploader';
import { getTripAction } from '@/app/(app)/trips/[tripId]/actions';
import { deleteTripAction } from '@/app/(app)/trips/actions';
import type { TripWithBookings } from '@/lib/db/repositories/trips';
import { Button } from '@/components/ui/button';

export function TripDetailClient({
  tripId,
  initialData,
}: {
  tripId: string;
  initialData: TripWithBookings;
}) {
  const [data, setData] = useState(initialData);
  const [isDeleting, startDelete] = useTransition();
  const router = useRouter();

  const isPolling = data.bookings.some((b) => b.status === 'parsing' || b.status === 'uploading');

  useEffect(() => {
    if (!isPolling) return;
    const interval = setInterval(async () => {
      const result = await getTripAction(tripId);
      if (result.ok) setData(result.data);
    }, 3000);
    return () => clearInterval(interval);
  }, [tripId, isPolling]);

  function handleDelete() {
    if (!confirm('Delete this trip and all its bookings? This cannot be undone.')) return;
    startDelete(async () => {
      const result = await deleteTripAction(tripId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push('/trips');
    });
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <a href="/trips" className="text-xs text-muted-foreground hover:text-foreground mb-1 block">
            ← Your trips
          </a>
          <h1 className="text-xl font-semibold">{data.title}</h1>
          {data.destination && (
            <p className="text-sm text-muted-foreground mt-0.5">{data.destination}</p>
          )}
        </div>
        <Button
          render={<button type="button" />}
          variant="ghost"
          onClick={handleDelete}
          disabled={isDeleting}
          className="text-muted-foreground hover:text-destructive text-sm"
        >
          {isDeleting ? 'Deleting…' : 'Delete trip'}
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left: bookings + upload */}
        <div className="space-y-4">
          <div>
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Bookings
            </h2>
            <div className="space-y-2">
              {data.bookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          </div>
          <BookingUploader tripId={tripId} />
        </div>

        {/* Right: map placeholder */}
        <div className="hidden lg:flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 min-h-[320px] gap-3 text-center p-8">
          <span className="text-4xl opacity-20">🗺</span>
          <p className="text-sm text-muted-foreground max-w-[180px] leading-relaxed">
            Map view available once bookings are parsed
          </p>
          <p className="text-xs text-muted-foreground/50">Coming in Phase 5</p>
        </div>
      </div>
    </div>
  );
}
