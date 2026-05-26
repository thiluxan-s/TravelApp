import { Button } from '@/components/ui/button';

export default function TripsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">No trips yet</h1>
        <p className="text-muted-foreground">
          Upload your booking confirmations to build your itinerary.
        </p>
      </div>
      <Button disabled>New trip</Button>
    </div>
  );
}
