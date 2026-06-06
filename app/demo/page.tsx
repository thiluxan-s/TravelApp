import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { getTripWithBookings } from '@/lib/db/repositories/trips';
import { groupSegmentsByDay } from '@/lib/itinerary/group-by-day';
import { ItineraryTimeline } from '@/components/itinerary/ItineraryTimeline';
import { MapPanel } from '@/components/itinerary/MapPanel';
import { env } from '@/lib/env.server';

export const metadata: Metadata = {
  title: 'Demo',
  description:
    'See how Wayfare turns booking confirmations into a unified itinerary. Tokyo, March 2026.',
};

export default async function DemoPage() {
  const trip = await getTripWithBookings(env.DEMO_TRIP_ID);

  if (!trip) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">
          Demo unavailable — please check back later.
        </p>
      </div>
    );
  }

  const segments = trip.bookings.flatMap((b) => b.segments);
  const dayGroups = groupSegmentsByDay(segments);
  const days = dayGroups.map((d) => ({ date: d.date, label: d.label }));

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Wayfare
          </Link>
          <Button render={<Link href="/sign-up" />} size="sm">
            Sign up free
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Trip header */}
        <div className="mb-6">
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-xl font-semibold">{trip.title}</h1>
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold tracking-wider text-amber-500">
              DEMO
            </span>
          </div>
          {trip.destination && (
            <p className="text-sm text-muted-foreground">{trip.destination}</p>
          )}
        </div>

        {/* Itinerary + Map */}
        <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-6">
          <div>
            <ItineraryTimeline dayGroups={dayGroups} tripId={trip.id} />
          </div>
          {segments.length > 0 && days.length > 0 && (
            <div className="mt-6 h-64 lg:sticky lg:top-6 lg:mt-0 lg:h-[calc(100vh-8rem)]">
              <MapPanel segments={segments} days={days} />
            </div>
          )}
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 flex items-center justify-between rounded-lg border border-border bg-card p-6">
          <div>
            <p className="font-medium">Like what you see?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload your own bookings and build your itinerary in minutes.
            </p>
          </div>
          <Button render={<Link href="/sign-up" />}>
            Create your own trip →
          </Button>
        </div>
      </main>
    </div>
  );
}
