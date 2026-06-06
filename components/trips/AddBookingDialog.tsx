'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BookingUploader } from '@/components/trips/BookingUploader';

export function AddBookingDialog({ tripId }: { tripId: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function handleUploadComplete() {
    router.refresh();
    setOpen(false);
  }

  return (
    <>
      <Button
        render={<button type="button" />}
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-sm"
      >
        + Add booking
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a booking</DialogTitle>
          </DialogHeader>
          <BookingUploader tripId={tripId} onUploadComplete={handleUploadComplete} />
        </DialogContent>
      </Dialog>
    </>
  );
}
