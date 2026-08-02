import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/clerk/webhook',
  '/api/inngest',
  '/demo',
  // Listed separately from '/demo' (an exact match) rather than switching that
  // entry to a prefix: this is an auth boundary, so it enumerates exactly what
  // is public. A future route added under /demo should be a deliberate
  // decision to expose, not something that inherits public access silently.
  '/demo/calendar.ics',
  '/opengraph-image',
  '/icon',
  '/apple-icon',
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
