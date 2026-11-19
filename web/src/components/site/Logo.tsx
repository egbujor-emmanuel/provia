/** Provia mark: a receipt with a check, cut by the lens circle. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <path d="M7 4h18v24l-3-2-3 2-3-2-3 2-3-2-3 2z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="20" cy="14" r="6.5" fill="currentColor" />
      <path d="M17.2 14.2l2 2 3.6-4" stroke="var(--logo-cut, #efe9dd)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
