import Link from 'next/link';
import { ESCROW, BASESCAN, REPO_URL } from '@/lib/evidence';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-ink-2 sm:grid-cols-3 sm:px-6">
        <div>
          <p className="font-display text-xl text-ink">Provia</p>
          <p className="mt-2 max-w-xs">Built for the zkVerify Agent Games. Test networks and Paystack test mode only; no real money moves.</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">Contracts</p>
          <a className="hash block hover:text-ink" href={`${BASESCAN}/address/${ESCROW.address}`} target="_blank" rel="noreferrer">
            Escrow {ESCROW.address}
          </a>
          <p className="text-xs text-ink-3">{ESCROW.chain}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-ink-3">For judges and agents</p>
          <Link className="block hover:text-ink" href="/how-it-works">How it works</Link>
          <a className="block hover:text-ink" href="/llms.txt">llms.txt</a>
          <a className="block hover:text-ink" href="/api/openapi.json">OpenAPI</a>
          <a className="block hover:text-ink" href={REPO_URL} target="_blank" rel="noreferrer">Source</a>
        </div>
      </div>
    </footer>
  );
}
