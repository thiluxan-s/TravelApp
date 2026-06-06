import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  ),
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
      <html lang="en" className="dark">
        <body>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:ring-2 focus:ring-ring"
          >
            Skip to content
          </a>
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
