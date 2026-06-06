// components/itinerary/ItinerarySkeleton.tsx
export function ItinerarySkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {[0, 1].map((day) => (
        <div key={day} className="space-y-2">
          <div className="h-3 w-32 rounded bg-muted" />
          <div className="h-[130px] rounded-lg bg-muted" />
          <div className="flex justify-center py-1">
            <div className="h-6 w-28 rounded-full bg-muted" />
          </div>
          <div className="h-[110px] rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}
