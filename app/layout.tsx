import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Wayfare',
    template: '%s — Wayfare',
  },
  description: 'Your travel second brain.',
  openGraph: {
    type: 'website',
    siteName: 'Wayfare',
    title: 'Wayfare',
    description: 'Your travel second brain.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wayfare',
    description: 'Your travel second brain.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
