// Deterministic claim reader: pulls a Paystack transaction reference out of the buyer's own words
// ("paid, ref T123abc456"). It only extracts; it never decides. No model is involved.

/** Paystack references: alphanumerics plus - . = (Paystack docs), here 8 to 100 characters. */
const REFERENCE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._=-]{7,99}$/;
const LABELLED = /\b(?:ref(?:erence)?|txn|transaction(?:\s+id)?)\s*(?:no\.?|number|id)?\s*[:#=-]?\s*([A-Za-z0-9][A-Za-z0-9._=-]{7,99})/i;

export interface ParsedClaim {
  readonly reference: string | null;
  readonly how: 'labelled' | 'only-candidate' | 'none' | 'ambiguous';
  readonly candidates: readonly string[];
}

const hasLetterAndDigit = (s: string) => /[A-Za-z]/.test(s) && /[0-9]/.test(s);

export function parseClaimMessage(message: string): ParsedClaim {
  const text = message.normalize('NFKC').slice(0, 2_000);
  const labelled = LABELLED.exec(text);
  if (labelled && hasLetterAndDigit(labelled[1])) {
    return { reference: labelled[1], how: 'labelled', candidates: [labelled[1]] };
  }
  const candidates = [
    ...new Set(
      text
        .split(/[\s,;:!?()"'<>[\]{}]+/)
        .map((t) => t.replace(/[.]+$/, ''))
        .filter((t) => REFERENCE_TOKEN.test(t) && hasLetterAndDigit(t)),
    ),
  ];
  if (candidates.length === 1) return { reference: candidates[0], how: 'only-candidate', candidates };
  return { reference: null, how: candidates.length === 0 ? 'none' : 'ambiguous', candidates };
}
