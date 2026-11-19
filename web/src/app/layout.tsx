import type { Metadata } from 'next';
import { Instrument_Serif, Space_Grotesk, Space_Mono } from 'next/font/google';
import { SmoothScroll } from '@/components/motion/SmoothScroll';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import './globals.css';

const sans = Space_Grotesk({ variable: '--font-grotesk', subsets: ['latin'], weight: ['300', '400', '500', '700'] });
const mono = Space_Mono({ variable: '--font-mono-face', subsets: ['latin'], weight: ['400', '700'] });
const serif = Instrument_Serif({ variable: '--font-serif', subsets: ['latin'], weight: '400', style: ['normal', 'italic'] });

export const metadata: Metadata = {
  title: 'Provia: crypto escrow with verified payment proofs',
  description:
    'Provia is an escrow agent that releases crypto only when the buyer’s fiat payment is proven, with zkTLS and a Groth16 proof verified on zkVerify.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'Provia',
    description: 'Crypto escrow that releases only on a verified payment proof.',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${serif.variable}`}>
      <body className="min-h-dvh">
        <SmoothScroll>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
            Skip to content
          </a>
          <SiteHeader />
          <main id="main">{children}</main>
          <SiteFooter />
        </SmoothScroll>
      </body>
    </html>
  );
}
