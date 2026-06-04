import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { parseBookingFunction } from '@/lib/inngest/functions/parse-booking';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [parseBookingFunction],
});
