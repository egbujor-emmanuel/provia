// Cuts footage/walkthrough.webm at the recorded beats (footage/marks.json) and fits each beat to its
// voice line, producing assets/walk.mp4 (silent) and assets/walk.json (segment starts, speed, clicks).
// Run after record.mjs: node edit.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const LEAD = 0.45;
const TAIL = 0.7;
const VOICE = 'assets/voice2';
const STEPS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11'];

const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const marks = JSON.parse(readFileSync('footage/marks.json', 'utf8'));
const at = (name) => marks.find((m) => m.name === name)?.t;
const end = at('end') ?? dur('footage/walkthrough.webm');
const clicks = marks.filter((m) => m.name.startsWith('click:')).map((m) => m.t);

mkdirSync('footage/seg', { recursive: true });
const segs = [];
let out = 0;
for (let i = 0; i < STEPS.length; i++) {
  const id = STEPS[i];
  const from = at(id);
  const to = i + 1 < STEPS.length ? at(STEPS[i + 1]) : end;
  if (from === undefined || to === undefined) throw new Error(`missing mark ${id}`);
  const target = Math.round((LEAD + dur(`${VOICE}/${id}.mp3`) + TAIL) * 100) / 100;
  const len = to - from;
  const factor = target / len; // < 1 speeds up, > 1 slows down
  // Never slow footage below 0.8x speed: hold the last frame instead (tpad) so motion stays natural.
  const pts = Math.max(factor, 1 / 1.25);
  const file = `footage/seg/${id}.mp4`;
  const vf = [`trim=start=${from}:end=${to}`, 'setpts=PTS-STARTPTS', `setpts=${pts.toFixed(5)}*PTS`, `tpad=stop_mode=clone:stop_duration=${Math.max(0, target - len * pts + 0.1).toFixed(2)}`, `trim=duration=${target}`, 'fps=30', 'format=yuv420p'].join(',');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', 'footage/walkthrough.webm', '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', file]);
  const segClicks = clicks.filter((c) => c >= from && c < to).map((c) => Math.round((out + (c - from) * pts) * 100) / 100);
  segs.push({ id, start: Math.round(out * 100) / 100, length: target, speed: Math.round((1 / pts) * 10) / 10, sourceSeconds: Math.round(len * 10) / 10, clicks: segClicks });
  out += target;
}

writeFileSync('footage/seg/list.txt', STEPS.map((id) => `file '${id}.mp4'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', 'footage/seg/list.txt', '-c', 'copy', 'assets/walk.mp4']);
writeFileSync('assets/walk.json', JSON.stringify({ total: Math.round(out * 100) / 100, segs }, null, 2));
rmSync('footage/seg', { recursive: true, force: true });
process.stdout.write(`walk.mp4 ${out.toFixed(1)}s\n${segs.map((s) => `${s.id} @${s.start}s len ${s.length}s speed ${s.speed}x (source ${s.sourceSeconds}s) clicks ${s.clicks.join(',')}`).join('\n')}\n`);
