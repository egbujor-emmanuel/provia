// Builds the Provia walkthrough: one scene per step from lines.json, timed to each voice clip.
// Run: node build.mjs   (then: npx hyperframes check)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const LEAD = 0.45;
const TAIL = 0.75;
const W = 1920;
const H = 1080;

const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const lines = JSON.parse(readFileSync('lines.json', 'utf8'));
const r2 = (n) => Math.round(n * 100) / 100;

// Per-scene camera and interaction. focus = where the push-in goes (shot pixels); click = cursor target.
const PLAN = {
  s1: { shot: '01-home.png', focus: [960, 540], zoom: [1.0, 1.04] },
  s2: { shot: '01-home.png', focus: [1330, 540], zoom: [1.0, 1.28] },
  s3: { shot: '01-home.png', next: '02-forged-running.png', click: [437, 732], clickAt: 1.5, focus: [437, 732], zoom: [1.0, 1.12], nextFocus: [1200, 470], nextZoom: [1.0, 1.18] },
  s4: { shot: '03-forged-refused.png', focus: [1200, 440], zoom: [1.05, 1.42], pop: 0.35 },
  s5: { shot: '03-forged-refused.png', focus: [590, 690], zoom: [1.05, 1.3] },
  s6: { shot: '03-forged-refused.png', next: '04-honest-running.png', click: [807, 896], clickAt: 1.3, focus: [807, 896], zoom: [1.0, 1.15], nextFocus: [1200, 700], nextZoom: [1.0, 1.16] },
  s7: { shot: '05-honest-released.png', focus: [620, 420], zoom: [1.05, 1.32], pop: 0.3 },
  s8: { shot: '06-receipt.png', click: [727, 850], clickAt: 2.4, focus: [900, 620], zoom: [1.0, 1.2] },
  s9: { shot: '07-release-explorer.png', focus: [900, 700], zoom: [1.0, 1.3] },
  s10: { shot: '08-zkverify-mainnet.png', focus: [700, 560], zoom: [1.0, 1.3] },
  s11: { end: true },
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function cam(id, img, focus, zoom, start, length) {
  const [fx, fy] = focus;
  return {
    html: `<div id="${id}" class="clip cam" data-start="${r2(start)}" data-duration="${r2(length)}" data-layout-allow-overflow><img id="${id}-img" src="assets/shots/${img}" alt="" /></div>`,
    js: `tl.fromTo("#${id}-img", { scale: ${zoom[0]}, transformOrigin: "${((fx / W) * 100).toFixed(1)}% ${((fy / H) * 100).toFixed(1)}%" }, { scale: ${zoom[1]}, duration: ${r2(length)}, ease: "power1.inOut" }, ${r2(start)});`,
  };
}

/** Where a shot pixel lands on screen after the push-in at time t (for placing the cursor). */
function screenPoint(p, focus, zoom, t, length) {
  const k = Math.min(1, Math.max(0, t / length));
  const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // ≈ power1.inOut
  const s = zoom[0] + (zoom[1] - zoom[0]) * e;
  return [focus[0] + (p[0] - focus[0]) * s, focus[1] + (p[1] - focus[1]) * s];
}

function sceneFile(l, length, plan) {
  const id = l.id;
  const parts = [];
  const js = [];
  if (plan.end) {
    parts.push(`<div id="${id}-end" class="clip end" data-start="0" data-duration="${r2(length)}">
      <img id="${id}-icon" src="assets/icon-1024.png" alt="" />
      <p id="${id}-name">Provia</p>
      <p id="${id}-line">Crypto escrow that releases only on a verified payment proof.</p>
      <p id="${id}-url">provia-ten.vercel.app</p>
      <p id="${id}-tags">#AgentGames · @ZKVProtocol</p>
    </div>`);
    js.push(`tl.fromTo("#${id}-icon", { scale: 0.86, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "back.out(1.6)" }, 0.15);`);
    js.push(`tl.fromTo(["#${id}-name", "#${id}-line", "#${id}-url", "#${id}-tags"], { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.12, ease: "power3.out" }, 0.4);`);
  } else {
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
      const sx = cx + 260;
      const sy = cy + 170;
      const cursorEnd = plan.next ? swap : length;
      parts.push(`<div id="${id}-cur" class="clip cursor" data-start="0.2" data-duration="${r2(cursorEnd - 0.2)}" data-layout-allow-overflow><svg viewBox="0 0 24 24" width="44" height="44"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg></div>`);
      parts.push(`<div id="${id}-ring" class="clip ring" data-start="${r2(tClick - 0.05)}" data-duration="0.7" data-layout-allow-overflow></div>`);
      js.push(`tl.fromTo("#${id}-cur svg", { x: ${r2(sx)}, y: ${r2(sy)} }, { x: ${r2(cx)}, y: ${r2(cy)}, duration: ${r2(tClick - 0.45)}, ease: "power2.inOut" }, 0.25);`);
      js.push(`tl.fromTo("#${id}-cur svg", { scale: 1 }, { scale: 0.86, duration: 0.08, yoyo: true, repeat: 1, ease: "power1.inOut" }, ${r2(tClick)});`);
      js.push(`tl.fromTo("#${id}-ring", { x: ${r2(cx - 30)}, y: ${r2(cy - 30)}, scale: 0.3, opacity: 0.9 }, { scale: 1.6, opacity: 0, duration: 0.6, ease: "power2.out" }, ${r2(tClick - 0.05)});`);
    }
    // Step caption: the "show" text, landing just after the voice starts.
    const [step, ...rest] = l.show.split(' · ');
    const isStep = /^Step \d/.test(step);
    parts.push(`<div id="${id}-cap" class="clip cap" data-start="${r2(LEAD)}" data-duration="${r2(length - LEAD)}">
      ${isStep ? `<span id="${id}-tag" class="tag">${esc(step)}</span><span id="${id}-txt" class="txt">${esc(rest.join(' · '))}</span>` : `<span id="${id}-txt" class="txt">${esc(l.show)}</span>`}
    </div>`);
    js.push(`tl.fromTo("#${id}-cap > *", { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, stagger: 0.08, ease: "power3.out" }, ${r2(LEAD)});`);
  }

  return `<template>
  <style>
    #root { position: absolute; inset: 0; background: #0a0b0d; overflow: hidden; font-family: Inter, sans-serif; }
    #root .cam { position: absolute; inset: 0; overflow: hidden; }
    #root .cam img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    #root .cursor { position: absolute; left: 0; top: 0; width: 44px; height: 44px; z-index: 5; filter: drop-shadow(0 3px 6px rgba(0,0,0,.55)); }
    #root .ring { position: absolute; left: 0; top: 0; width: 60px; height: 60px; border-radius: 50%; border: 4px solid #3ddc84; z-index: 4; }
    #root .cap { position: absolute; left: 96px; right: 96px; bottom: 84px; display: flex; align-items: center; gap: 22px; z-index: 6; }
    #root .tag { flex: none; background: #3ddc84; color: #06140c; font: 700 30px/1 'Space Mono', monospace; padding: 16px 22px; border-radius: 12px; }
    #root .txt { background: rgba(10,11,13,.9); color: #fff; font-weight: 700; font-size: 42px; line-height: 1.2; padding: 18px 28px; border-radius: 14px; box-shadow: 0 18px 40px rgba(0,0,0,.45); }
    #root .end { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #fff; }
    #root .end img { width: 220px; height: 220px; border-radius: 48px; }
    #root .end p:nth-of-type(1) { margin-top: 34px; font-size: 96px; font-weight: 900; letter-spacing: -0.02em; }
    #root .end p:nth-of-type(2) { margin-top: 14px; font-size: 38px; color: #c9c6bf; }
    #root .end p:nth-of-type(3) { margin-top: 40px; font: 700 40px/1 'Space Mono', monospace; color: #3ddc84; }
    #root .end p:nth-of-type(4) { margin-top: 22px; font: 400 28px/1 'Space Mono', monospace; color: #8a8780; }
  </style>
  <div id="root" data-composition-id="${id}" data-width="${W}" data-height="${H}">
    ${parts.join('\n    ')}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    ${js.join('\n    ')}
    window.__timelines["${id}"] = tl;
  </script>
</template>
`;
}

mkdirSync('compositions', { recursive: true });
let t = 0;
const hosts = [];
const audio = [];
let sfxN = 0;
for (const l of lines) {
  const plan = PLAN[l.id];
  const v = dur(`assets/voice/${l.id}.mp3`);
  const length = r2(LEAD + v + TAIL + (plan.end ? 1.4 : 0));
  writeFileSync(`compositions/${l.id}.html`, sceneFile(l, length, plan));
  hosts.push(`<div id="${l.id}" data-composition-id="${l.id}" data-composition-src="compositions/${l.id}.html" data-start="${r2(t)}" data-duration="${length}" data-track-index="1" data-track-kind="graphics" data-width="${W}" data-height="${H}"></div>`);
  audio.push(`<audio id="vo-${l.id}" src="assets/voice/${l.id}.mp3" data-start="${r2(t + LEAD)}" data-duration="${r2(v)}" data-track-index="2" data-volume="1"></audio>`);
  if (plan.click) {
    const take = sfxN++ % 2 ? 'click2' : 'click1';
    audio.push(`<audio id="sfx-click-${l.id}" src="assets/sfx/${take}.mp3" data-start="${r2(t + LEAD + plan.clickAt - 0.02)}" data-duration="0.28" data-track-index="3" data-volume="0.9"></audio>`);
  }
  if (plan.pop) audio.push(`<audio id="sfx-pop-${l.id}" src="assets/sfx/pop1.mp3" data-start="${r2(t + LEAD + plan.pop - 0.06)}" data-duration="0.9" data-track-index="3" data-volume="0.55"></audio>`);
  if (t > 0 && PLAN[l.id].shot !== PLAN[lines[lines.indexOf(l) - 1].id]?.next && PLAN[l.id].shot !== PLAN[lines[lines.indexOf(l) - 1].id]?.shot) {
    audio.push(`<audio id="sfx-swoosh-${l.id}" src="assets/sfx/swoosh.mp3" data-start="${r2(t - 0.5)}" data-duration="1.6" data-track-index="4" data-volume="0.35"></audio>`);
  }
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
