'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { BookingStatus } from '@/lib/db/schema';
import {
  deleteBookingAction,
  retryBookingParseAction,
} from '@/app/(app)/trips/[tripId]/actions';

export function BookingActions({
  bookingId,
  status,
}: {
  bookingId: string;
  status: BookingStatus;
}) {
  const [isPending, startAction] = useTransition();
  const router = useRouter();

  function handleRetry() {
    startAction(async () => {
      const result = await retryBookingParseAction(bookingId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Trying again…');
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm('Remove this booking? This cannot be undone.')) return;
    startAction(async () => {
      const result = await deleteBookingAction(bookingId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-1">
      {status === 'parsing_failed' && (
        <Button
          render={<button type="button" />}
          variant="ghost"
          onClick={handleRetry}
          disabled={isPending}
          className="h-auto px-2 py-1 text-xs"
        >
          Try again
        </Button>
      )}
      <Button
        render={<button type="button" />}
        variant="ghost"
        onClick={handleDelete}
        disabled={isPending}
        className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-destructive"
      >
        Remove
      </Button>
    </div>
  );
}
