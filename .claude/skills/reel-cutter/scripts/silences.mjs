#!/usr/bin/env node
// Silences in a recording, from ffmpeg silencedetect.
//   node silences.mjs <video> [--noise -35] [--min 0.4] [--out silences.json]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { args, run, probe, fmt } from './lib.mjs';

const { flags, pos } = args();
if (!pos[0]) { console.error('usage: node silences.mjs <video> [--noise -35] [--min 0.4] [--out silences.json]'); process.exit(1); }
const input = resolve(pos[0]);
const info = probe(input);
const noise = Number(flags.noise ?? -35), min = Number(flags.min ?? 0.4);
const r = run('ffmpeg', ['-hide_banner', '-nostats', '-i', input, '-vn', '-af', `silencedetect=noise=${noise}dB:d=${min}`, '-f', 'null', '-']);
const silences = [];
let s = null;
for (const line of (r.stderr || '').split(/\r?\n/)) {
  const a = line.match(/silence_start: (-?[\d.]+)/); if (a) s = Math.max(0, Number(a[1]));
  const b = line.match(/silence_end: ([\d.]+)/);
  if (b && s !== null) { silences.push({ start: +s.toFixed(3), end: +Number(b[1]).toFixed(3) }); s = null; }
}
if (s !== null) silences.push({ start: +s.toFixed(3), end: +info.duration.toFixed(3) });
const total = silences.reduce((t, x) => t + x.end - x.start, 0);
const doc = { duration: info.duration, noise, min, silences, totalSilence: +total.toFixed(2) };
if (flags.out) writeFileSync(resolve(flags.out), JSON.stringify(doc, null, 1));
console.log(`${silences.length} silences over ${min}s, ${fmt(total)} of ${fmt(info.duration)} (${Math.round(100 * total / info.duration)}%)`);
