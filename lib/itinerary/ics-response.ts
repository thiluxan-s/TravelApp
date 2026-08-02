import type { Segment } from '@/lib/db/schema';
import { segmentsToIcs, icsFilename } from './to-ics';

/** Shared by the authed and demo routes so the headers cannot drift apart. */
export function icsResponse(tripTitle: string, segments: Segment[]): Response {
  return new Response(segmentsToIcs(tripTitle, segments), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${icsFilename(tripTitle)}"`,
    },
  });
}
