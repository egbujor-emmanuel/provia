// Records one continuous walkthrough of the live Provia site (real scrolling, real clicks, real
// trades) with a visible cursor. Writes footage/walkthrough.webm and footage/marks.json, the time
// of every narration beat and click, so the edit can line the voice and click sounds up exactly.
// Run: node record.mjs   (opens a Chrome window; the honest trade takes 1-4 minutes)
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readdirSync, renameSync } from 'node:fs';

const SITE = 'https://provia-ten.vercel.app';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync('footage', { recursive: true });

// Cursor and click ring drawn inside the page, so they appear in the recording.
const CURSOR = `
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.id = '__cursor';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(-100px,-100px)', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.6))' });
    document.documentElement.appendChild(c);
    addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: (e.clientX - 22) + 'px', top: (e.clientY - 22) + 'px', width: '44px', height: '44px', borderRadius: '50%', border: '4px solid #3ddc84', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .5s ease-out, opacity .5s ease-out' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  });
`;

const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--window-size=1300,820', '--force-device-scale-factor=1.5'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1.5,
  recordVideo: { dir: 'footage', size: { width: 1920, height: 1080 } },
});
await context.addInitScript(CURSOR);
const page = await context.newPage();
const t0 = Date.now();
const marks = [];
const mark = (name) => marks.push({ name, t: (Date.now() - t0) / 1000 });
const wait = (ms) => page.waitForTimeout(ms);

/** Smooth human-ish mouse travel to an element's centre (or a point), then optionally click. */
async function moveTo(target, { click = false, steps = 28 } = {}) {
  let x, y;
  if (typeof target === 'string') {
    const box = await page.locator(target).first().boundingBox();
    if (!box) throw new Error(`not visible: ${target}`);
    x = box.x + box.width / 2;
    y = box.y + box.height / 2;
  } else [x, y] = target;
  await page.mouse.move(x, y, { steps });
  if (click) {
    mark(`click:${typeof target === 'string' ? target : 'point'}`);
    await page.mouse.down();
    await wait(70);
    await page.mouse.up();
  }
}

async function scrollBy(px, seconds) {
  const steps = Math.max(1, Math.round(seconds * 12));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, px / steps);
    await wait((seconds * 1000) / steps);
  }
}

async function verdict() {
  return page.locator('article').first().innerText().catch(() => '');
}

// s1: open the site.
await page.goto(SITE, { waitUntil: 'networkidle' });
await page.mouse.move(640, 360);
await wait(1500);
mark('s1');
await wait(5800);

// s2: the lens over the alert.
mark('s2');
const lens = await page.locator('[role="img"]').first().boundingBox();
if (lens) {
  await moveTo([lens.x + lens.width * 0.2, lens.y + lens.height * 0.45], { steps: 20 });
  await moveTo([lens.x + lens.width * 0.55, lens.y + lens.height * 0.42], { steps: 60 });
  await moveTo([lens.x + lens.width * 0.4, lens.y + lens.height * 0.62], { steps: 40 });
}
await wait(1200);

// s3: click "Try a forged payment" (the page scrolls to the attack lab and starts a real trade).
mark('s3');
await moveTo('button:has-text("Try a forged payment")', { click: true });
await wait(2500);

// s4: wait for the refusal on screen.
for (let i = 0; i < 60 && !/Refused\./.test(await verdict()); i++) await wait(500);
mark('s4');
await moveTo('article >> text=NO_PAYMENT_AT_PSP', { steps: 30 }).catch(() => {});
await wait(5200);

// s5: the other attacks.
mark('s5');
for (const name of ['Short payment', 'Someone else', 'Replay']) {
  await moveTo(`#try button:has-text("${name}")`, { steps: 24 }).catch(() => {});
  await wait(1700);
}
await wait(1500);

// s6: run the honest buyer and watch the steps.
mark('s6');
await moveTo('#try button:has-text("Honest buyer")', { click: true });
// The lab must actually start the honest trade (a rate-limit refusal shows an alert instead).
for (let i = 0; i < 40 && !/HONEST PAYMENT/i.test(await verdict()); i++) {
  const alert = await page.locator('#try [role="alert"]').first().innerText().catch(() => '');
  if (alert) throw new Error(`agent refused to start the honest trade: ${alert}`);
  await wait(500);
}
if (!/HONEST PAYMENT/i.test(await verdict())) throw new Error('honest trade receipt never appeared');
await wait(2500);
mark('s7');
for (let i = 0; i < 480 && !/Released\.|Refused\.|Stopped on an error/.test(await verdict()); i++) {
  if (i % 20 === 10) await scrollBy(120, 1.2);
  await wait(500);
}
if (!/Released\./.test(await verdict())) throw new Error('honest trade did not release: ' + (await verdict()).slice(0, 200));
mark('s8');
await moveTo('article >> text=Released.', { steps: 30 }).catch(() => {});
await wait(5500);

// s9: open the public receipt and scroll through it.
mark('s9');
await moveTo('article a:has-text("Public receipt")', { click: true });
await page.waitForURL(/\/receipts\//);
await wait(1500);
await scrollBy(900, 4.5);
const releaseHref = await page.locator('a:has-text("Release tx on Basescan")').last().getAttribute('href');
const mainnetHref = await page.locator('a:has-text("zkVerify on Subscan")').first().getAttribute('href');
await moveTo('a:has-text("Release tx on Basescan") >> nth=-1', { click: true }).catch(() => {});
await wait(600);

// s10: the release on the Base Sepolia explorer (Blockscout allows automated browsers).
mark('s10');
const tx = releaseHref?.match(/0x[0-9a-fA-F]{64}/)?.[0];
if (tx) {
  await page.goto(`https://base-sepolia.blockscout.com/tx/${tx}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Tokens transferred').first().waitFor({ timeout: 30000 }).catch(() => {});
  await wait(1200);
  await scrollBy(320, 1.5);
  await moveTo('text=Tokens transferred', { steps: 30 }).catch(() => {});
  await wait(2500);
}

// s11: the proof on zkVerify mainnet.
mark('s11');
if (mainnetHref) {
  await page.goto(mainnetHref, { waitUntil: 'domcontentloaded' });
  await page.getByText('Succeeded').first().waitFor({ timeout: 30000 }).catch(() => {});
  await page.locator('button:has-text("OK")').first().click({ timeout: 2000 }).catch(() => {});
  await wait(800);
  await scrollBy(220, 1.2);
  await moveTo('text=Succeeded', { steps: 30 }).catch(() => {});
  await wait(3500);
}
mark('end');

const video = page.video();
await context.close();
await browser.close();
const file = await video.path();
renameSync(file, 'footage/walkthrough.webm');
writeFileSync('footage/marks.json', JSON.stringify(marks, null, 2));
process.stdout.write(`recorded ${((Date.now() - t0) / 1000).toFixed(1)}s; marks: ${marks.map((m) => `${m.name}@${m.t.toFixed(1)}`).join(' ')}\n`);
for (const f of readdirSync('footage')) if (f.endsWith('.webm') && f !== 'walkthrough.webm') process.stdout.write(`extra file: ${f}\n`);
