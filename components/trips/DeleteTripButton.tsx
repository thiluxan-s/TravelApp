'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteTripAction } from '@/app/(app)/trips/actions';

export function DeleteTripButton({ tripId }: { tripId: string }) {
  const [isDeleting, startDelete] = useTransition();
  const router = useRouter();

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
    <Button
      render={<button type="button" />}
      variant="ghost"
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-muted-foreground hover:text-destructive text-sm"
    >
      {isDeleting ? 'Deleting…' : 'Delete trip'}
    </Button>
  );
}
