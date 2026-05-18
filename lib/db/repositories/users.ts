import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, type User } from '@/lib/db/schema';

export async function getUserByClerkId(clerkUserId: string): Promise<User | undefined> {
  return db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });
}

export async function createUserFromClerk(
  clerkUserId: string,
  email: string,
): Promise<User> {
  const result = await db
    .insert(users)
    .values({ clerkUserId, email })
    .returning();

  const user = result[0];
  if (!user) {
    throw new Error(`INSERT into users returned no rows (clerkUserId: ${clerkUserId})`);
  }
  return user;
}

export async function updateUserEmail(
  clerkUserId: string,
  email: string,
): Promise<void> {
  await db
    .update(users)
    .set({ email, updatedAt: new Date() })
    .where(eq(users.clerkUserId, clerkUserId));
}

export async function deleteUserByClerkId(clerkUserId: string): Promise<void> {
  await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
}
