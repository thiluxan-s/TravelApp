import { redirect } from 'next/navigation';
import { auth, currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import {
  getUserByClerkId,
  createUserFromClerk,
} from '@/lib/db/repositories/users';

async function ensureUserExists(userId: string): Promise<void> {
  const existing = await getUserByClerkId(userId);
  if (!existing) {
    const clerkUser = await currentUser();
    const email = clerkUser?.emailAddresses[0]?.emailAddress ?? '';
    await createUserFromClerk(userId, email);
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');

  await ensureUserExists(userId);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-lg tracking-tight">Wayfare</span>
          <UserButton />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8" id="main-content">{children}</main>
    </div>
  );
}
