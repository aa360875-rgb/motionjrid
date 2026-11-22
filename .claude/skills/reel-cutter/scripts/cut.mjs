#!/usr/bin/env node
// Cut a reel from a long recording.
//
//   node cut.mjs <video> <edl.json> <out.mp4> [--transcript transcript.json] [--max-gap 0.35]
//                [--aspect 9:16|1:1|16:9|keep] [--focus 0.5] [--lufs -14] [--crf 18] [--dry]
//
// edl.json: { "segments": [ { "start": s, "end": s, "note": "..." }, ... ] } in SOURCE seconds, played in order.
// With --transcript and --max-gap, every segment is split wherever the words pause longer than max-gap,
// and the pause is removed. Writes <out>.cuts.json and, with a transcript, <out>.words.json re-timed to the reel.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, basename, extname } from 'node:path';
import { args, must, probe, fmt } from './lib.mjs';

const { flags, pos } = args();
const [videoArg, edlArg, outArg] = pos;
if (!videoArg || !edlArg || !outArg) {
  console.error('usage: node cut.mjs <video> <edl.json> <out.mp4> [--transcript t.json] [--max-gap 0.35] [--aspect 9:16|keep] [--focus 0.5]');
  process.exit(1);
}
const video = resolve(videoArg), out = resolve(outArg);
const info = probe(video);
const edl = JSON.parse(readFileSync(resolve(edlArg), 'utf8'));
const words = flags.transcript ? JSON.parse(readFileSync(resolve(flags.transcript), 'utf8')).words : null;
const maxGap = Number(flags['max-gap'] ?? 0.35);
const PAD_IN = 0.06, PAD_OUT = 0.1, FADE = 0.012;

const segs = (edl.segments || []).map((s, i) => {
  const start = Math.max(0, Number(s.start)), end = Math.min(info.duration, Number(s.end));
  if (!(end > start)) throw new Error(`segment ${i + 1}: end must be after start (${s.start} -> ${s.end})`);
  return { start, end, note: s.note || '' };
});
if (!segs.length) throw new Error('edl.json has no segments');

// Split each segment at long pauses between words, padding into the pause.
const pieces = [];
for (const s of segs) {
  const ws = words ? words.filter(w => w.end > s.start + 0.01 && w.start < s.end - 0.01) : [];
  if (!words || !ws.length || flags['max-gap'] === 'off') { pieces.push({ ...s, srcStart: s.start, srcEnd: s.end }); continue; }
  let group = [ws[0]];
  const flush = () => {
    const first = group[0], last = group[group.length - 1];
    const idx = ws.indexOf(first), lidx = ws.indexOf(last);
    const prevEnd = idx > 0 ? ws[idx - 1].end : s.start - 10;
    const nextStart = lidx < ws.length - 1 ? ws[lidx + 1].start : s.end + 10;
    const a = Math.max(s.start, first.start - Math.min(PAD_IN, (first.start - prevEnd) / 2));
    const b = Math.min(s.end, last.end + Math.min(PAD_OUT, (nextStart - last.end) / 2));
    if (b - a > 0.05) pieces.push({ srcStart: a, srcEnd: b, note: s.note });
  };
  for (let i = 1; i < ws.length; i++) {
    if (ws[i].start - ws[i - 1].end > maxGap) { flush(); group = []; }
    group.push(ws[i]);
  }
  flush();
}

const fps = info.fps > 45 ? 60 : info.fps > 26 ? 30 : info.fps > 24.5 ? 25 : 24;
let t = 0;
const cuts = pieces.map(p => {
  const dur = Math.max(1, Math.round((p.srcEnd - p.srcStart) * fps)) / fps;
  p.srcEnd = p.srcStart + dur;
  const c = { outStart: +t.toFixed(3), outEnd: +(t + dur).toFixed(3), srcStart: +p.srcStart.toFixed(3), srcEnd: +p.srcEnd.toFixed(3), note: p.note };
  t += dur;
  return c;
});
const total = t;
const sourceKept = segs.reduce((a, s) => a + s.end - s.start, 0);
console.log(`${segs.length} segments -> ${cuts.length} cuts, ${fmt(sourceKept)} selected -> ${fmt(total)} after removing pauses`);

// Frame
const aspect = String(flags.aspect || '9:16');
let vf = [];
let W = info.width, H = info.height;
if (aspect !== 'keep') {
  const [aw, ah] = aspect.split(':').map(Number);
  const target = aw / ah;
  const src = info.width / info.height;
  const focus = Math.min(1, Math.max(0, Number(flags.focus ?? 0.5)));
  const even = n => Math.floor(n / 2) * 2;
  if (src > target + 1e-3) {
    const cw = even(info.height * target);
    vf.push(`crop=${cw}:${even(info.height)}:${Math.round((info.width - cw) * focus)}:0`);
  } else if (src < target - 1e-3) {
    const ch = even(info.width / target);
    vf.push(`crop=${even(info.width)}:${ch}:0:${Math.round((info.height - ch) * 0.4)}`);
  }
  [W, H] = target < 1 ? [1080, Math.round(1080 / target / 2) * 2] : [Math.round(1080 * target / 2) * 2, 1080];
  vf.push(`scale=${W}:${H}:flags=lanczos`);
}
vf.push(`fps=${fps}`, 'setsar=1', 'format=yuv420p');

if (flags.dry) { console.log(JSON.stringify(cuts, null, 1)); process.exit(0); }

// Build: one seeked input per cut (fast on long sources), trimmed, faded, concatenated, loudness-normalised.
const inputs = [], chains = [], labels = [];
cuts.forEach((c, i) => {
  const dur = (c.srcEnd - c.srcStart).toFixed(3);
  inputs.push('-ss', c.srcStart.toFixed(3), '-t', dur, '-i', video);
  chains.push(`[${i}:v:0]${vf.join(',')},trim=duration=${dur},setpts=PTS-STARTPTS[v${i}]`);
  const fo = Math.max(0, Number(dur) - FADE).toFixed(3);
  chains.push(`[${i}:a:0]aresample=48000,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,apad=whole_dur=${dur},atrim=duration=${dur},afade=t=in:d=${FADE},afade=t=out:st=${fo}:d=${FADE}[a${i}]`);
  labels.push(`[v${i}][a${i}]`);
});
const lufs = Number(flags.lufs ?? -14);
chains.push(`${labels.join('')}concat=n=${cuts.length}:v=1:a=1[vc][ac]`);
chains.push(`[ac]loudnorm=I=${lufs}:TP=-1.0:LRA=11,aresample=48000[ao]`);

mkdirSync(dirname(out), { recursive: true });
const graphFile = join(dirname(out), basename(out, extname(out)) + '.filter.txt');
writeFileSync(graphFile, chains.join(';\n'));
must('ffmpeg', ['-v', 'error', '-stats', '-y', ...inputs, '-filter_complex_script', graphFile, '-map', '[vc]', '-map', '[ao]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', String(flags.crf ?? 18), '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { stdio: ['ignore', 'inherit', 'pipe'] });

const base = join(dirname(out), basename(out, extname(out)));
writeFileSync(base + '.cuts.json', JSON.stringify({ source: video, aspect, size: [W, H], fps, duration: +total.toFixed(3), cuts }, null, 1));
if (words) {
  const mapped = [];
  for (const c of cuts) for (const w of words) {
    if (w.start >= c.srcStart - 0.001 && w.end <= c.srcEnd + 0.001) {
      mapped.push({ text: w.text, start: +(c.outStart + w.start - c.srcStart).toFixed(3), end: +(c.outStart + w.end - c.srcStart).toFixed(3) });
    }
  }
  writeFileSync(base + '.words.json', JSON.stringify({ duration: +total.toFixed(3), words: mapped }, null, 1));
  console.log(mapped.map(w => w.text).join(' '));
}
const real = probe(out).duration;
if (words) {
  // Same transcript in talking-head-b-roll's transcript.json shape, so it never has to transcribe the reel again.
  const ws = JSON.parse(readFileSync(base + '.words.json', 'utf8')).words;
  const lines = [];
  let cur = null;
  for (const w of ws) {
    if (!cur || w.start - cur.end > 0.6 || /[.!?؟…]$/.test(cur.text)) { if (cur) lines.push(cur); cur = { start: w.start, end: w.end, text: w.text }; }
    else { cur.end = w.end; cur.text += ' ' + w.text; }
  }
  if (cur) lines.push(cur);
  writeFileSync(base + '.transcript.json', JSON.stringify({
    video: { file: out, width: W, height: H, fps, duration: +real.toFixed(3) }, engine: 'reel-cutter (re-timed)', words: ws, lines,
  }, null, 1));
}
console.log(`\n${out}\n${W}x${H} ${fps}fps, ${fmt(real)} (${cuts.length} cuts)`);
