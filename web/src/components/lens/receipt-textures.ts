// The two layers of the truth lens card, drawn on canvas at runtime so text stays crisp.
// Surface: what a scammer shows (a credit alert). Truth: what Provia sees at the same spot
// (Paystack has no such transaction). Same layout, so the lens reveals the matching region.
// The alert is generic: no real bank's branding.

export const TEX_W = 1600;
export const TEX_H = 1000;

const REF = 'PSK-48213907X';

const L = { padX: 90, chipY: 250, amountY: 470, lineY: [610, 665, 720], footY: 880, markX: 1380, markY: 400 };

function fonts() {
  const css = getComputedStyle(document.body);
  return {
    sans: css.getPropertyValue('--font-grotesk').trim() || 'system-ui, sans-serif',
    mono: css.getPropertyValue('--font-mono-face').trim() || 'ui-monospace, monospace',
    serif: css.getPropertyValue('--font-serif').trim() || 'Georgia, serif',
  };
}

function canvas(scale: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = TEX_W * scale;
  c.height = TEX_H * scale;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  ctx.scale(scale, scale);
  return [c, ctx];
}

function frame(ctx: CanvasRenderingContext2D, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(0, 0, TEX_W, TEX_H, 48);
  ctx.fill();
}

export function drawSurface(scale: number): HTMLCanvasElement {
  const [c, ctx] = canvas(scale);
  const f = fonts();
  frame(ctx, '#fbf8f1');
  ctx.fillStyle = 'rgba(21,20,15,0.05)';
  for (let i = 0; i < 2200; i++) ctx.fillRect(Math.random() * TEX_W, Math.random() * TEX_H, 1, 1);

  ctx.fillStyle = '#15140f';
  ctx.font = `600 34px ${f.sans}`;
  ctx.fillText('Bank alert', L.padX, 130);
  ctx.fillStyle = '#85817a';
  ctx.font = `400 26px ${f.sans}`;
  ctx.fillText('now · screenshot_2291.png', L.padX, 172);

  ctx.fillStyle = '#0f7a4a';
  ctx.font = `600 30px ${f.sans}`;
  ctx.fillText('●  Credit · Transfer received', L.padX, L.chipY);

  ctx.fillStyle = '#15140f';
  ctx.font = `400 190px ${f.serif}`;
  ctx.fillText('₦1,500.00', L.padX - 6, L.amountY);

  ctx.fillStyle = '#4a4740';
  ctx.font = `400 34px ${f.mono}`;
  ctx.fillText(`Ref      ${REF}`, L.padX, L.lineY[0]);
  ctx.fillText('From     Adebayo O.', L.padX, L.lineY[1]);
  ctx.fillText('Status   SUCCESSFUL · 14:02', L.padX, L.lineY[2]);

  ctx.strokeStyle = '#e2dccf';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(L.padX, 800);
  ctx.lineTo(TEX_W - L.padX, 800);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#85817a';
  ctx.font = `400 28px ${f.sans}`;
  ctx.fillText('Looks real. Nothing here has been checked with anyone.', L.padX, L.footY);

  ctx.fillStyle = '#0f7a4a';
  ctx.beginPath();
  ctx.arc(L.markX, L.markY, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fbf8f1';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(L.markX - 34, L.markY);
  ctx.lineTo(L.markX - 8, L.markY + 28);
  ctx.lineTo(L.markX + 38, L.markY - 28);
  ctx.stroke();
  return c;
}

export function drawTruth(scale: number): HTMLCanvasElement {
  const [c, ctx] = canvas(scale);
  const f = fonts();
  frame(ctx, '#15140f');
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < TEX_H; y += 4) ctx.fillRect(0, y, TEX_W, 1);

  ctx.fillStyle = '#85817a';
  ctx.font = `400 28px ${f.mono}`;
  ctx.fillText('$ provia verify --zktls', L.padX, 130);
  ctx.fillStyle = '#c9c4ba';
  ctx.fillText(`GET /transaction/verify/${REF}`, L.padX, 172);

  ctx.fillStyle = '#e8432a';
  ctx.font = `700 30px ${f.mono}`;
  ctx.fillText('← 400 Transaction reference not found', L.padX, L.chipY);

  ctx.font = `400 150px ${f.serif}`;
  ctx.fillText('No payment.', L.padX, L.amountY - 10);

  ctx.fillStyle = '#e4e0d7';
  ctx.font = `400 34px ${f.mono}`;
  ctx.fillText('zkTLS    no attested response', L.padX, L.lineY[0]);
  ctx.fillText('Groth16  not provable', L.padX, L.lineY[1]);
  ctx.fillText('Escrow   funds stay locked', L.padX, L.lineY[2]);

  ctx.fillStyle = '#85817a';
  ctx.font = `400 28px ${f.sans}`;
  ctx.fillText('Paystack never saw this transfer. The picture is all there is.', L.padX, L.footY);

  ctx.save();
  ctx.translate(L.markX - 60, L.markY);
  ctx.rotate(-0.12);
  ctx.strokeStyle = '#e8432a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(-170, -58, 340, 116, 10);
  ctx.stroke();
  ctx.fillStyle = '#e8432a';
  ctx.font = `700 54px ${f.mono}`;
  ctx.textAlign = 'center';
  ctx.fillText('REFUSED', 0, 19);
  ctx.restore();
  return c;
}
