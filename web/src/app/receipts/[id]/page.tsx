import type { Metadata } from 'next';
import Link from 'next/link';
import { ReceiptView } from '@/components/receipt/ReceiptView';

export const metadata: Metadata = { title: 'Provia receipt' };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 pb-14 pt-28 sm:px-6">
      <Link href="/receipts" className="text-sm text-ink-3 hover:text-ink">
        ← All receipts
      </Link>
      <h1 className="mt-4 font-display text-5xl tracking-tight">Public receipt</h1>
      <p className="mt-2 text-ink-2">
        Every step the agent took for this claim, read live from the agent. Links open the transactions on public explorers. Receipt <span className="hash">{id}</span>.
      </p>
      <div className="mt-8">
        <ReceiptView id={id} />
      </div>
    </div>
  );
}
