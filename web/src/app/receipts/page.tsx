import type { Metadata } from 'next';
import { ReceiptList } from '@/components/receipt/ReceiptList';

export const metadata: Metadata = { title: 'Provia receipts' };

export default function ReceiptsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pb-14 pt-28 sm:px-6">
      <h1 className="font-display text-5xl tracking-tight">Receipts</h1>
      <p className="mt-2 max-w-2xl text-ink-2">Every claim the live agent has handled, newest first. Refusals are receipts too: each names the rule that stopped it.</p>
      <div className="mt-8">
        <ReceiptList />
      </div>
    </div>
  );
}
