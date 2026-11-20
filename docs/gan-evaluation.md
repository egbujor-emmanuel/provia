# Provia live evaluation (2026-11-20)

Mode achieved: playwright (partial). The Playwright MCP here had no console, evaluate or wait tools. Console errors, computed contrast and programmatic overflow checks were NOT performed. Desktop 1440 was checked via accessibility snapshot, not a visual review. Mobile was checked with one screenshot of the hero.

## Verified
- Home loads. Live strip: block #61,353,065, escrow 0x2786C7...9a26 linked to Basescan, latest receipt linked. Lens has an img role and alt text; on mobile it renders (grain, lens over a forged alert).
- Forged screenshot preset: ran once. The receipt ended "Refused." with NO_PAYMENT_AT_PSP in about 2 s (it said ~20 s). It showed no funds moved, 5 steps, a Lock tx Basescan link and a public receipt link. The agent API receipt matched.
- Released receipt 45e2c76d...: "Released.", 12 steps. It shows a zkVerify mainnet Subscan link (200), a testnet Subscan link (200), a lock tx and a release tx on Basescan, and "paid 50000 USDC units". Basescan returned 403 to curl, which is bot-blocking and not a broken link. I did not click it in a browser.
- /llms.txt 200 text/plain, with the endpoint list, contracts and 10 refusal codes. /api/openapi.json 200. /how-it-works 200. /receipts 200. A bad URL returns 404 with a styled page.
- Keyboard: Skip-to-content link shows a strong focus ring on first Tab.

## Bugs (ranked)
1. Medium: mobile header at 390px drops the nav (Attack lab, How it works, Receipts, Evidence). Only "Try it" remains and there is no menu. A mobile judge can't reach /how-it-works or /receipts except via the footer. Fix: add a disclosure menu, or collapse the links into a scrollable row.
2. Low: UI and the home copy say refusals take ~20 s. Observed 2 to 3 s. Fix: update the copy, "seconds" is already used in one place.
3. Low: the receipt step list lacks an explicit "Refused" terminal link back to the code definitions. Fix: link the code to the refusal table in /how-it-works or llms.txt.
4. Low: llms.txt does not mention the Agent Games HMAC `/agent` preflight reply shape or the receipts page. Fix: add a short note.
5. Not verified: console errors, contrast ratios (muted grey-on-black body copy at 390px looks around 4.5:1, borderline), hover states, rapid-click on presets, and whether the other four presets work.

## Scores (1-10)
- Design quality: 8.5. Cohesive dark editorial look, strong type, the lens hero is memorable, and focus states are clear.
- Originality: 8.5. The attack-first lab with real trades and typed refusals, plus an on-chain verified release, is distinctive.
- Craft: 8. The semantics are good (skip link, regions, alt text) and the receipts are rich and linked. It loses points for the missing mobile nav and the unverified console and contrast checks.
- Functionality: 9. The real refusal ran end to end and the released receipt is fully linked and traceable.
- Overall: 8.5.

## Recommendation
Fix the mobile navigation first, correct the refusal timing copy, then re-check the console and contrast in a real browser.
