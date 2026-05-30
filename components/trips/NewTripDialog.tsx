'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { createTripAction } from '@/app/(app)/trips/actions';

export function NewTripDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleOpenChange(next: boolean) {
    if (!next) {
      setTitle('');
      setDestination('');
    }
    setOpen(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createTripAction({ title, destination: destination || undefined });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      router.push(`/trips/${result.data.tripId}`);
    });
  }

  return (
    <>
      <Button render={<button type="button" />} onClick={() => setOpen(true)}>
        New trip
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New trip</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">Trip name</Label>
                <Input
                  id="title"
                  placeholder="e.g. Tokyo March 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="destination">
                  Destination{' '}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="destination"
                  placeholder="e.g. Tokyo, Japan"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button
                render={<button type="button" />}
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button render={<button type="submit" />} disabled={!title.trim() || isPending}>
                {isPending ? 'Creating…' : 'Create trip'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
