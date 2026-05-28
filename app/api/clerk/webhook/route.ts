import { headers } from 'next/headers';
import { Webhook } from 'svix';
import type { WebhookEvent } from '@clerk/nextjs/server';
import { env } from '@/lib/env.server';
import {
  createUserFromClerk,
  updateUserEmail,
  deleteUserByClerkId,
} from '@/lib/db/repositories/users';

export async function POST(req: Request) {
  const body = await req.text();

  const headerStore = await headers();
  const svixId = headerStore.get('svix-id');
  const svixTimestamp = headerStore.get('svix-timestamp');
  const svixSignature = headerStore.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response('Missing svix headers', { status: 400 });
  }

  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
  let event: WebhookEvent;

  try {
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  switch (event.type) {
    case 'user.created': {
      const { id, email_addresses } = event.data;
      const email = email_addresses[0]?.email_address ?? '';
      await createUserFromClerk(id, email);
      break;
    }
    case 'user.updated': {
      const { id, email_addresses } = event.data;
      const email = email_addresses[0]?.email_address ?? '';
      await updateUserEmail(id, email);
      break;
    }
    case 'user.deleted': {
      const { id } = event.data;
      if (id) await deleteUserByClerkId(id);
      break;
    }
    default:
      return Response.json({ ignored: true });
  }

  return Response.json({ received: true });
}
