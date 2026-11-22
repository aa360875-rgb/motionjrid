#!/usr/bin/env node
// Word-timed transcript of a long recording with local whisper.cpp.
//
//   node transcribe.mjs <video> [--language ar|en|auto] [--out transcript.json] [--model path] [--bin path] [--threads n]
//   node transcribe.mjs --check
//
// Writes { video, engine, language, words: [{text,start,end}], lines: [{start,end,text}] } and prints the lines.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { tmpdir, homedir, cpus } from 'node:os';
import { args, which, run, must, probe, fmt } from './lib.mjs';

const { flags, pos } = args();

function findBin() {
  const cand = [flags.bin, process.env.WHISPER_BIN].filter(Boolean);
  for (const c of cand) if (existsSync(c)) return c;
  for (const n of ['whisper-cli', 'whisper-cpp', 'main']) {
    const p = which(n);
    if (p && (n !== 'main' || /whisper/i.test(p))) return p;
  }
  for (const d of [join(homedir(), 'whisper'), join(homedir(), 'whisper', 'Release'), join(homedir(), 'whisper.cpp', 'build', 'bin')]) {
    for (const n of ['whisper-cli.exe', 'whisper-cli']) if (existsSync(join(d, n))) return join(d, n);
  }
  return null;
}

function findModel() {
  const cand = [flags.model, process.env.WHISPER_MODEL].filter(Boolean);
  for (const c of cand) if (existsSync(c)) return c;
  const dirs = [join(homedir(), '.cache', 'whisper'), join(homedir(), 'whisper', 'models'), join(homedir(), 'whisper.cpp', 'models'),
    '/opt/homebrew/share/whisper-cpp', '/usr/local/share/whisper-cpp'];
  const rank = f => { const i = ['large-v3-turbo', 'large', 'medium', 'small', 'base', 'tiny'].findIndex(s => f.includes(s)); return i < 0 ? 99 : i; };
  const found = [];
  for (const d of dirs) if (existsSync(d)) for (const f of readdirSync(d)) if (/^ggml-.*\.bin$/.test(f) && !/silero|vad/.test(f)) found.push(join(d, f));
  found.sort((a, b) => rank(basename(a)) - rank(basename(b)));
  return found[0] || null;
}

const bin = findBin(), model = findModel();
if (flags.check || !pos[0]) {
  console.log(`ffmpeg   ${which('ffmpeg') || 'MISSING'}`);
  console.log(`whisper  ${bin || 'MISSING (set WHISPER_BIN or pass --bin)'}`);
  console.log(`model    ${model || 'MISSING (put ggml-large-v3-turbo.bin in ~/.cache/whisper)'}`);
  if (!pos[0]) process.exit(bin && model && which('ffmpeg') ? 0 : 1);
}
if (!bin || !model) { console.error('whisper.cpp or its model is missing: see SKILL.md, section 0.'); process.exit(1); }

const input = resolve(pos[0]);
if (!existsSync(input)) { console.error(`${input} not found`); process.exit(1); }
const info = probe(input);
if (!info.hasAudio) { console.error('the file has no audio track'); process.exit(1); }
const out = resolve(flags.out || join(dirname(input), basename(input, extname(input)) + '-reel', 'transcript.json'));
const language = flags.language || 'ar';

const tmp = mkdtempSync(join(tmpdir(), 'reel-'));
const wav = join(tmp, 'a.wav');
must('ffmpeg', ['-v', 'error', '-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);

const threads = String(flags.threads || Math.max(2, Math.min(8, cpus().length - 1)));
const prefix = join(tmp, 'w');
console.error(`transcribing ${fmt(info.duration)} of audio with ${basename(model)} (${language}) ...`);
const r = run(bin, ['-m', model, '-f', wav, '-l', language, '-t', threads, '-ml', '1', '-sow', '-oj', '-of', prefix, '-np'], { stdio: ['ignore', 'pipe', 'pipe'] });
if (r.status !== 0 || !existsSync(prefix + '.json')) { console.error((r.stderr || '').slice(-3000)); rmSync(tmp, { recursive: true, force: true }); process.exit(1); }

const raw = JSON.parse(readFileSync(prefix + '.json', 'utf8'));
rmSync(tmp, { recursive: true, force: true });

const words = [];
for (const seg of raw.transcription || []) {
  const text = String(seg.text || '').trim();
  if (!text || /^\[.*\]$/.test(text) || /^\(.*\)$/.test(text)) continue;
  const start = seg.offsets.from / 1000, end = seg.offsets.to / 1000;
  if (end <= start) continue;
  words.push({ text, start: +start.toFixed(3), end: +end.toFixed(3) });
}

const lines = [];
let cur = null;
const endsSentence = t => /[.!?؟…]$/.test(t);
for (const w of words) {
  const gap = cur ? w.start - cur.end : 0;
  if (!cur || gap > 0.7 || cur.end - cur.start > 12) {
    if (cur) lines.push(cur);
    cur = { start: w.start, end: w.end, text: w.text };
  } else { cur.end = w.end; cur.text += ' ' + w.text; }
  if (endsSentence(w.text)) { lines.push(cur); cur = null; }
}
if (cur) lines.push(cur);

const doc = { video: { file: input, ...info }, engine: `whisper.cpp ${basename(model)}`, language, words, lines };
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 1));
for (const l of lines) console.log(`${fmt(l.start).padStart(8)} - ${fmt(l.end).padStart(8)}  ${l.text}`);
console.error(`\n${words.length} words, ${lines.length} lines -> ${out}`);
