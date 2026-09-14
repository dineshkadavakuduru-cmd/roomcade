import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = 'https://roomcade.vercel.app';

export const metadata: Metadata = {
  title: 'Roomcade — 3D multiplayer party games via room code',
  description: 'Create a room, share a code, play 3D party games with friends. No accounts, no installs.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Roomcade — 3D multiplayer party games via room code',
    description: 'Create a room, get a short code, and play 3D party games with friends. No accounts, no installs.',
    type: 'website',
    images: [{ url: `${SITE_URL}/og.jpg`, width: 1200, height: 630, alt: 'Roomcade — 3D multiplayer party games' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Roomcade — 3D multiplayer party games via room code',
    description: 'Create a room, share a code, play 3D party games with friends.',
    images: [`${SITE_URL}/og.jpg`],
  },
};

const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;700&display=swap';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Preload the font stylesheet so it starts fetching immediately, avoiding FOUT */}
        <link rel="preload" as="style" href={FONT_CSS_URL} />
        <link href={FONT_CSS_URL} rel="stylesheet" />
      </head>
      <body className="grain min-h-screen antialiased">{children}</body>
    </html>
  );
}
