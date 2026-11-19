'use client';

import Link from 'next/link';
import { Logo } from './Logo';

const NAV = [
  { href: '/#try', label: 'Attack lab' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/receipts', label: 'Receipts' },
  { href: '/#evidence', label: 'Evidence' },
];

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md [--logo-cut:var(--paper)]">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-6 px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2" aria-label="Provia home">
          <Logo className="size-5" />
          <span className="font-display text-[22px] leading-none">Provia</span>
        </Link>
        <nav aria-label="Main navigation" className="ml-auto hidden items-center gap-6 text-sm text-ink-2 md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="transition-colors hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <Link href="/#try" className="ml-auto rounded-md border border-ink px-3 py-1.5 text-sm font-medium transition-colors hover:bg-ink hover:text-paper md:ml-0">
          Try it
        </Link>
      </div>
    </header>
  );
}
