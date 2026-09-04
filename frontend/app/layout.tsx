import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '../components/auth-provider';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5173'),
  title: 'ClipForge Cutter — Lange Videos schnell in Clips verwandeln',
  description: 'Schneide lange Videos sicher zu Reels, Shorts und TikToks – mit Untertiteln, Reaction-Layouts und hochwertigem Export.',
  openGraph: {
    title: 'ClipForge Cutter',
    description: 'Lange Videos. Starke Clips.',
    images: [{url:'/og.png',width:1200,height:630,alt:'ClipForge Cutter – Lange Videos. Starke Clips.'}],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClipForge Cutter',
    description: 'Lange Videos. Starke Clips.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" translate="no" suppressHydrationWarning>
      <body suppressHydrationWarning><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
