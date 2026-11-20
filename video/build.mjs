// Builds the Provia walkthrough from lines.json: problem → why → how it works → how to use (5 steps) → end.
// Each scene is timed to its voice clip. Run: node build.mjs, then npx hyperframes lint.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const LEAD = 0.45;
const TAIL = 0.7;
const W = 1920;
const H = 1080;
const VOICE = 'assets/voice2';

const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const lines = JSON.parse(readFileSync('lines.json', 'utf8'));
const r2 = (n) => Math.round(n * 100) / 100;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const PLAN = {
  p1: { kind: 'alert' },
  p2: { kind: 'alert', fake: 2.4, pop: 2.4 },
  p3: { kind: 'text', sub: 'The seller trusts a picture.' },
  p4: { kind: 'brand' },
  p5: { kind: 'diagram', reveal: [[0, 1.7], [1, 5.6]] },
  p6: { kind: 'diagram', shown: [0, 1], reveal: [[2, 0.4], [3, 3.2]], banner: 5.4, pop: 5.4 },
  s1: { shot: '01-home.png', focus: [960, 540], zoom: [1.0, 1.05] },
  s2: { shot: '01-home.png', focus: [1290, 520], zoom: [1.0, 1.45] },
  s3: { shot: '01-home.png', next: '02-forged-running.png', click: [437, 732], clickAt: 1.4, focus: [437, 732], zoom: [1.0, 1.25], nextFocus: [1200, 460], nextZoom: [1.35, 1.6] },
  s4: { shot: 'c1-forged-refused.png', focus: [700, 250], zoom: [1.0, 1.1], pop: 0.3 },
  s5: { shot: 'c4-attack-list.png', focus: [480, 520], zoom: [1.0, 1.07] },
  s6: { shot: '03-forged-refused.png', next: '04-honest-running.png', click: [807, 896], clickAt: 1.25, focus: [807, 896], zoom: [1.1, 1.4], nextFocus: [1200, 700], nextZoom: [1.35, 1.55] },
  s7: { shot: 'c3-honest-steps.png', focus: [700, 450], zoom: [1.0, 1.09] },
  s8: { shot: 'c2-honest-released.png', focus: [520, 220], zoom: [1.0, 1.12], pop: 0.3 },
  s9: { shot: 'c3-honest-steps.png', click: [560, 603], clickAt: 2.3, focus: [560, 603], zoom: [1.0, 1.14] },
  s10: { shot: 'c5-release-explorer.png', focus: [900, 765], zoom: [1.0, 1.25] },
  s11: { shot: 'c6-zkverify-mainnet.png', focus: [960, 606], zoom: [1.0, 1.25] },
  end: { kind: 'end' },
};

const DIAGRAM = [
  ['zkTLS', 'Proves what the payment company says'],
  ['Groth16', 'Proves the trade rules'],
  ['zkVerify', 'Verifies the proof'],
  ['Escrow', 'Pays only after verification'],
];

function cam(id, img, focus, zoom, start, length) {
  const [fx, fy] = focus;
  return {
    html: `<div id="${id}" class="clip cam" data-start="${r2(start)}" data-duration="${r2(length)}" data-layout-allow-overflow><img id="${id}-img" src="assets/shots/${img}" alt="" /></div>`,
    js: `tl.fromTo("#${id}-img", { scale: ${zoom[0]}, transformOrigin: "${((fx / W) * 100).toFixed(1)}% ${((fy / H) * 100).toFixed(1)}%" }, { scale: ${zoom[1]}, duration: ${r2(length)}, ease: "power1.inOut" }, ${r2(start)});`,
  };
}

function screenPoint(p, focus, zoom, t, length) {
  const k = Math.min(1, Math.max(0, t / length));
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
  const s = zoom[0] + (zoom[1] - zoom[0]) * e;
  return [focus[0] + (p[0] - focus[0]) * s, focus[1] + (p[1] - focus[1]) * s];
}

function caption(id, show, length) {
  const [step, ...rest] = show.split(' · ');
  const isStep = /^Step \d/.test(step);
  const html = `<div id="${id}-cap" class="clip cap" data-start="${r2(LEAD)}" data-duration="${r2(length - LEAD)}">
      ${isStep ? `<span id="${id}-tag" class="tag">${esc(step)}</span><span id="${id}-txt" class="txt">${esc(rest.join(' · '))}</span>` : `<span id="${id}-txt" class="txt">${esc(show)}</span>`}
    </div>`;
  const js = `tl.fromTo("#${id}-cap > *", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: "power3.out" }, ${r2(LEAD)});`;
  return { html, js };
}

function designed(id, l, length, plan) {
  const parts = [];
  const js = [];
  const hold = plan.kind === 'end' ? ' data-hold' : '';
  const timed = (inner, cls = '') => `<div id="${id}-stage" class="clip stage" data-start="0" data-duration="${r2(length)}"${hold}><div id="${id}-drift" class="drift ${cls}">${inner}</div></div>`;
  js.push(`tl.fromTo("#${id}-drift", { scale: 1 }, { scale: 1.045, duration: ${r2(length)}, ease: "none" }, 0);`);
  if (plan.kind === 'alert') {
    parts.push(
      timed(`
      <div id="${id}-card" class="alertcard">
        <p class="a1">Bank app · now</p>
        <p class="a2">● Credit alert</p>
        <p class="a3">$1,500.00</p>
        <p class="a4">Transfer received from Buyer</p>
        <p class="a5">Status: SUCCESSFUL</p>
        ${plan.fake ? `<span id="${id}-fake" class="fake" data-layout-allow-overlap>FAKE</span>` : ''}
      </div>
      <h2 id="${id}-head" class="side">${esc(l.show)}</h2>`),
    );
    js.push(`tl.fromTo("#${id}-card", { x: -24, rotation: -1.5 }, { x: 0, rotation: 0, duration: 0.9, ease: "power3.out" }, 0);`);
    js.push(`tl.fromTo("#${id}-head", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, ${r2(LEAD)});`);
    if (plan.fake) js.push(`tl.fromTo("#${id}-fake", { scale: 2.6, opacity: 0, rotation: -14 }, { scale: 1, opacity: 1, rotation: -10, duration: 0.32, ease: "back.out(2.4)" }, ${r2(LEAD + plan.fake)});`);
  } else if (plan.kind === 'text') {
    parts.push(timed(`<h2 id="${id}-big" class="big">${esc(l.show)}.</h2><p id="${id}-sub" class="sub">${esc(plan.sub)}</p>`));
    js.push(`tl.fromTo("#${id}-big", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out" }, ${r2(LEAD)});`);
    js.push(`tl.fromTo("#${id}-sub", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: "power3.out" }, ${r2(LEAD + 1.6)});`);
  } else if (plan.kind === 'brand' || plan.kind === 'end') {
    const end = plan.kind === 'end';
    parts.push(
      timed(`<img id="${id}-icon" class="icon" src="assets/icon-1024.png" alt="" />
      <p id="${id}-kick" class="kick">${end ? '' : 'Why we built it'}</p>
      <h2 id="${id}-name" class="name">Provia</h2>
      <p id="${id}-line" class="line">${end ? 'Crypto escrow that releases only on a verified payment proof.' : 'Holds the crypto. Releases it only when the payment is proven.'}</p>
      ${end ? `<p id="${id}-url" class="url">provia-ten.vercel.app</p><p id="${id}-tags" class="tags">#AgentGames · @ZKVProtocol</p>` : ''}`, 'center'),
    );
    js.push(`tl.fromTo("#${id}-icon", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.6)" }, 0.15);`);
    const ids = [`#${id}-kick`, `#${id}-name`, `#${id}-line`].concat(end ? [`#${id}-url`, `#${id}-tags`] : []);
    js.push(`tl.fromTo(${JSON.stringify(ids)}, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, stagger: 0.14, ease: "power3.out" }, 0.4);`);
  } else if (plan.kind === 'diagram') {
    const boxes = DIAGRAM.map(
      ([t, d], i) => `${i > 0 ? `<span id="${id}-arr${i}" class="arr">→</span>` : ''}<div id="${id}-box${i}" class="box"><span class="num">${i + 1}</span><p class="bt">${t}</p><p class="bd">${d}</p></div>`,
    ).join('');
    parts.push(timed(`<p id="${id}-title" class="dtitle">${esc(plan.banner ? 'How it works' : l.show)}</p><div class="row">${boxes}</div>${plan.banner ? `<p id="${id}-banner" class="banner">No proof, no release.</p>` : ''}`));
    js.push(`tl.fromTo("#${id}-title", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.1);`);
    const shown = plan.shown ?? [];
    for (let i = 0; i < 4; i++) {
      const rev = plan.reveal.find(([b]) => b === i);
      if (shown.includes(i)) js.push(`tl.fromTo(["#${id}-box${i}"${i > 0 ? `, "#${id}-arr${i}"` : ''}], { opacity: 1 }, { opacity: 1, duration: 0.1 }, 0);`);
      else if (rev) js.push(`tl.fromTo(["#${id}-box${i}"${i > 0 ? `, "#${id}-arr${i}"` : ''}], { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, ${r2(LEAD + rev[1])});`);
      else js.push(`tl.fromTo(["#${id}-box${i}"${i > 0 ? `, "#${id}-arr${i}"` : ''}], { opacity: 0 }, { opacity: 0, duration: 0.1 }, 0);`);
    }
    if (plan.banner) js.push(`tl.fromTo("#${id}-banner", { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" }, ${r2(LEAD + plan.banner)});`);
  }
  return { parts, js };
}

function shotScene(id, l, length, plan) {
  const parts = [];
  const js = [];
  const swap = plan.next ? LEAD + plan.clickAt + 0.45 : length;
  const a = cam(`${id}-a`, plan.shot, plan.focus, plan.zoom, 0, swap);
  parts.push(a.html);
  js.push(a.js);
  if (plan.next) {
    const b = cam(`${id}-b`, plan.next, plan.nextFocus, plan.nextZoom, swap, length - swap);
    parts.push(b.html);
    js.push(b.js);
    js.push(`tl.fromTo("#${id}-b-img", { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power1.out" }, ${r2(swap)});`);
  }
  if (plan.click) {
    const tClick = LEAD + plan.clickAt;
    const [cx, cy] = screenPoint(plan.click, plan.focus, plan.zoom, tClick, plan.next ? swap : length);
    const cursorEnd = plan.next ? swap : length;
    parts.push(`<div id="${id}-cur" class="clip cursor" data-start="0.2" data-duration="${r2(cursorEnd - 0.2)}" data-layout-allow-overflow><svg viewBox="0 0 24 24" width="56" height="56"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg></div>`);
    parts.push(`<div id="${id}-ring" class="clip ring" data-start="${r2(tClick - 0.05)}" data-duration="0.7" data-layout-allow-overflow></div>`);
    js.push(`tl.fromTo("#${id}-cur svg", { x: ${r2(cx + 300)}, y: ${r2(cy + 190)} }, { x: ${r2(cx)}, y: ${r2(cy)}, duration: ${r2(tClick - 0.45)}, ease: "power2.inOut" }, 0.25);`);
    js.push(`tl.fromTo("#${id}-cur svg", { scale: 1 }, { scale: 0.85, duration: 0.08, yoyo: true, repeat: 1, ease: "power1.inOut" }, ${r2(tClick)});`);
    js.push(`tl.fromTo("#${id}-ring", { x: ${r2(cx - 36)}, y: ${r2(cy - 36)}, scale: 0.3, opacity: 0.95 }, { scale: 1.7, opacity: 0, duration: 0.6, ease: "power2.out" }, ${r2(tClick - 0.05)});`);
  }
  return { parts, js };
}

const STYLE = `
    #root { position: absolute; inset: 0; background: #0a0b0d; overflow: hidden; font-family: Inter, sans-serif; color: #fff; }
    #root .cam { position: absolute; inset: 0; overflow: hidden; }
    #root .cam img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    #root .cursor { position: absolute; left: 0; top: 0; width: 56px; height: 56px; z-index: 5; }
    #root .ring { position: absolute; left: 0; top: 0; width: 72px; height: 72px; border-radius: 50%; border: 5px solid #3ddc84; z-index: 4; }
    #root .cap { position: absolute; left: 96px; right: 96px; bottom: 78px; display: flex; align-items: center; gap: 24px; z-index: 6; }
    #root .tag { flex: none; background: #3ddc84; color: #06140c; font: 700 36px/1 'Space Mono', monospace; padding: 18px 24px; border-radius: 14px; }
    #root .txt { background: rgba(10,11,13,.92); color: #fff; font-weight: 700; font-size: 52px; line-height: 1.15; padding: 20px 30px; border-radius: 16px; border: 2px solid rgba(255,255,255,.12); }
    #root .stage { position: absolute; inset: 0; background: radial-gradient(80% 70% at 30% 40%, #1a1b20, #0a0b0d 70%); }
    #root .drift { position: absolute; inset: 0; }
    #root .drift.center { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    #root .alertcard { position: absolute; left: 150px; top: 220px; width: 720px; padding: 52px 56px; background: #fbf8f1; color: #15140f; border-radius: 40px; box-shadow: 0 40px 90px rgba(0,0,0,.6); }
    #root .alertcard .a1 { font-size: 30px; color: #827d72; }
    #root .alertcard .a2 { margin-top: 26px; font-size: 38px; font-weight: 700; color: #0f7a4a; }
    #root .alertcard .a3 { margin-top: 10px; font-size: 128px; font-weight: 900; letter-spacing: -0.03em; }
    #root .alertcard .a4 { margin-top: 6px; font-size: 34px; color: #4b4840; }
    #root .alertcard .a5 { margin-top: 18px; font: 700 30px/1 'Space Mono', monospace; color: #4b4840; }
    #root .fake { position: absolute; right: 40px; top: 120px; border: 9px solid #e8432a; color: #e8432a; font: 700 110px/1 'Space Mono', monospace; padding: 14px 30px; border-radius: 18px; letter-spacing: .08em; }
    #root .side { position: absolute; left: 990px; right: 110px; top: 360px; font-size: 92px; line-height: 1.05; font-weight: 900; letter-spacing: -0.02em; }
    #root .big { position: absolute; left: 140px; right: 140px; top: 330px; font-size: 118px; line-height: 1.04; font-weight: 900; letter-spacing: -0.03em; }
    #root .sub { position: absolute; left: 140px; top: 640px; font-size: 52px; color: #ff7a5c; font-weight: 700; }
    #root .icon { width: 230px; height: 230px; border-radius: 50px; }
    #root .kick { margin-top: 30px; font: 700 34px/1 'Space Mono', monospace; color: #3ddc84; text-transform: uppercase; letter-spacing: .1em; }
    #root .name { margin-top: 14px; font-size: 140px; font-weight: 900; letter-spacing: -0.03em; line-height: 1; }
    #root .line { margin-top: 22px; font-size: 50px; color: #d6d3cc; max-width: 1500px; }
    #root .url { margin-top: 44px; font: 700 52px/1 'Space Mono', monospace; color: #3ddc84; }
    #root .tags { margin-top: 24px; font: 400 34px/1 'Space Mono', monospace; color: #8a8780; }
    #root .dtitle { position: absolute; left: 0; right: 0; top: 150px; text-align: center; font-size: 76px; font-weight: 900; }
    #root .row { position: absolute; left: 90px; right: 90px; top: 360px; display: flex; align-items: center; justify-content: space-between; }
    #root .box { width: 372px; height: 390px; background: #15161a; border: 3px solid #3ddc84; border-radius: 26px; padding: 34px 30px; }
    #root .num { display: inline-block; width: 64px; height: 64px; border-radius: 50%; background: #3ddc84; color: #06140c; font: 700 38px/64px 'Space Mono', monospace; text-align: center; }
    #root .bt { margin-top: 24px; font-size: 56px; font-weight: 900; }
    #root .bd { margin-top: 12px; font-size: 33px; line-height: 1.25; color: #cfccc5; }
    #root .arr { font-size: 70px; color: #3ddc84; font-weight: 900; }
    #root .banner { position: absolute; left: 0; right: 0; top: 820px; text-align: center; font-size: 84px; font-weight: 900; color: #ff7a5c; }
`;

function sceneFile(l, length, plan) {
  const id = l.id;
  const body = plan.kind ? designed(id, l, length, plan) : shotScene(id, l, length, plan);
  const showCaption = !plan.kind;
  if (showCaption) {
    const c = caption(id, l.show, length);
    body.parts.push(c.html);
    body.js.push(c.js);
  }
  return `<template>
  <style>${STYLE}</style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
    ${body.parts.join('\n    ')}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    ${body.js.join('\n    ')}
    window.__timelines["${id}"] = tl;
  </script>
</template>
`;
}

mkdirSync('compositions', { recursive: true });
let t = 0;
const hosts = [];
const audio = [];
let clickN = 0;
let prevShot = null;
for (const l of lines) {
  const plan = PLAN[l.id];
  const v = dur(`${VOICE}/${l.id}.mp3`);
  const length = r2(LEAD + v + TAIL + (plan.kind === 'end' ? 1.6 : 0));
  writeFileSync(`compositions/${l.id}.html`, sceneFile(l, length, plan));
  hosts.push(`<div id="${l.id}" data-composition-id="${l.id}" data-composition-src="compositions/${l.id}.html" data-start="${r2(t)}" data-duration="${length}" data-track-index="1" data-track-kind="graphics" data-width="${W}" data-height="${H}"></div>`);
  audio.push(`<audio id="vo-${l.id}" src="${VOICE}/${l.id}.mp3" data-start="${r2(t + LEAD)}" data-duration="${r2(v)}" data-track-index="2" data-volume="1"></audio>`);
  if (plan.click) audio.push(`<audio id="sfx-click-${l.id}" src="assets/sfx/${clickN++ % 2 ? 'click2' : 'click1'}.mp3" data-start="${r2(t + LEAD + plan.clickAt - 0.02)}" data-duration="0.28" data-track-index="3" data-volume="0.9"></audio>`);
  if (plan.pop) audio.push(`<audio id="sfx-pop-${l.id}" src="assets/sfx/pop1.mp3" data-start="${r2(t + LEAD + plan.pop - 0.06)}" data-duration="0.9" data-track-index="3" data-volume="0.55"></audio>`);
  const visual = plan.shot ?? plan.kind;
  if (t > 0 && visual !== prevShot && !(plan.kind === 'alert' && prevShot === 'alert') && !(plan.kind === 'diagram' && prevShot === 'diagram')) {
    audio.push(`<audio id="sfx-swoosh-${l.id}" src="assets/sfx/swoosh.mp3" data-start="${r2(Math.max(0, t - 0.5))}" data-duration="1.6" data-track-index="4" data-volume="0.3"></audio>`);
  }
  prevShot = plan.next ?? visual;
  t += length;
}
const total = r2(t);

writeFileSync(
  'index.html',
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #0a0b0d; }
      #main { position: relative; width: 100%; height: 100%; }
    </style>
  </head>
  <body>
    <div id="main" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}">
      ${hosts.join('\n      ')}
      ${audio.join('\n      ')}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`,
);
process.stdout.write(`built ${lines.length} scenes, ${total}s\n`);
