#!/usr/bin/env node
// Word-by-word captions, Arabic-correct (joined letters, right-to-left), burned into a video with ffmpeg/libass.
//
//   node captions.mjs <video> <words.json> <out.mp4> [--font cairo|plex|tajawal|thmanyah] [--font-file f.otf] [--align center|right]
//                     [--words 3] [--y 0.70] [--size 0.05] [--text #F3EBDD] [--outline #0E0E0E] [--accent #C6F432] [--brand <brand dir>]
//                     [--no-burn]
//
// words.json: { words: [{ text, start, end }] } on the video's own timeline (reel-cutter writes reel.words.json).
// Writes <out>.ass and <out>.srt next to the output. Colours default to the motion-director brand in
// ~/motion-director/profile.json, else Ali Tech defaults.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, basename, extname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2), v = argv[i + 1]; if (v === undefined || v.startsWith('--')) flags[k] = true; else { flags[k] = v; i++; } }
  else pos.push(argv[i]);
}
const [videoArg, wordsArg, outArg] = pos;
if (!videoArg || !wordsArg || !outArg) { console.error('usage: node captions.mjs <video> <words.json> <out.mp4> [--font cairo|plex|tajawal] [--words 3] [--y 0.70]'); process.exit(1); }

const SKILL = dirname(dirname(fileURLToPath(import.meta.url)));
const FONTS = {
  cairo: { file: 'Cairo_900Black.ttf', family: 'Cairo Black', bold: 0, size: 0.052 },
  'cairo-bold': { file: 'Cairo_700Bold.ttf', family: 'Cairo', bold: 1, size: 0.052 },
  plex: { file: 'IBMPlexSansArabic_700Bold.ttf', family: 'IBM Plex Sans Arabic', bold: 1, size: 0.048 },
  tajawal: { file: 'Tajawal_900Black.ttf', family: 'Tajawal', bold: 1, size: 0.056 },
};
// Any TTF/OTF font: read its full name from the 'name' table (libass matches fonts by full name too).
function fontFullName(file) {
  const b = readFileSync(file);
  const tag = b.toString('latin1', 0, 4);
  if (tag === 'wOFF' || tag === 'wOF2') throw new Error(`${basename(file)} is a web font (WOFF); libass needs the .ttf or .otf file`);
  const n = b.readUInt16BE(4);
  let off = -1;
  for (let i = 0; i < n; i++) { const r = 12 + i * 16; if (b.toString('latin1', r, r + 4) === 'name') { off = b.readUInt32BE(r + 8); break; } }
  if (off < 0) throw new Error(`${basename(file)} has no name table`);
  const count = b.readUInt16BE(off + 2), strOff = off + b.readUInt16BE(off + 4);
  const found = {};
  for (let i = 0; i < count; i++) {
    const r = off + 6 + i * 12;
    const plat = b.readUInt16BE(r), enc = b.readUInt16BE(r + 2), lang = b.readUInt16BE(r + 4), id = b.readUInt16BE(r + 6);
    const len = b.readUInt16BE(r + 8), o = strOff + b.readUInt16BE(r + 10);
    if (![1, 4, 16].includes(id)) continue;
    let str;
    if (plat === 3 || plat === 0) { const u = Buffer.from(b.subarray(o, o + len)); u.swap16(); str = u.toString('utf16le'); }
    else if (plat === 1 && enc === 0) str = b.toString('latin1', o, o + len);
    else continue;
    const score = (plat === 3 && lang === 0x409) ? 2 : 1;
    if (!found[id] || found[id].score < score) found[id] = { str, score };
  }
  const name = found[4]?.str || found[1]?.str;
  if (!name) throw new Error(`no font name in ${basename(file)}`);
  return name;
}
// Thmanyah (or any font named on --font) installed on the machine or kept next to the project.
function findFont(pattern) {
  const home = homedir();
  const dirs = [process.cwd(), join(process.cwd(), 'fonts'), dirname(process.cwd()), join(dirname(process.cwd()), 'fonts'),
    join(dirname(resolve(videoArg)), 'fonts'), dirname(resolve(videoArg)),
    'C:\\Windows\\Fonts', join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Microsoft', 'Windows', 'Fonts'),
    join(home, 'Library', 'Fonts'), '/Library/Fonts', join(home, '.fonts'), join(home, '.local', 'share', 'fonts'), '/usr/share/fonts', join(home, 'Downloads')];
  const hits = [], webOnly = [];
  const scan = (d, depth) => {
    let list; try { list = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (depth > 0 && e.name !== '_fonts' && !e.name.startsWith('.')) scan(p, depth - 1); continue; }
      if (!pattern.test(e.name)) continue;
      if (/\.(ttf|otf)$/i.test(e.name)) hits.push(p); else if (/\.woff2?$/i.test(e.name)) webOnly.push(p);
    }
  };
  for (const d of [...new Set(dirs)]) scan(d, 2);
  const rank = f => { const n = basename(f).toLowerCase(); let r = 0;
    if (/serif/.test(n)) r += 50; if (/display/.test(n)) r += 5;
    const w = ['black', 'heavy', 'extrabold', 'bold', 'semibold', 'medium', 'regular', 'light'].findIndex(x => n.includes(x));
    return r + (w < 0 ? 6 : w); };
  const uniq = [...new Set(hits.map(f => resolve(f)))];
  uniq.sort((a, b) => rank(a) - rank(b));
  return { file: uniq[0] || null, all: uniq, webOnly: [...new Set(webOnly)] };
}

let font;
if (flags['font-file'] || flags.font === 'thmanyah') {
  let file = flags['font-file'] ? resolve(flags['font-file']) : null;
  if (!file) {
    const r = findFont(/thmanyah/i);
    if (!r.file) {
      console.error(r.webOnly.length
        ? `Thmanyah found only as web fonts (${r.webOnly.map(f => basename(f)).join(', ')}). libass needs .ttf or .otf: pass one with --font-file.`
        : 'Thmanyah font not found in the project, its fonts folder, Downloads or the system fonts. Pass its .ttf/.otf with --font-file <path>.');
      process.exit(2);
    }
    file = r.file;
    console.log(`Thmanyah files found: ${r.all.map(f => basename(f)).join(', ')}`);
  }
  if (!existsSync(file)) { console.error(`${file} not found`); process.exit(2); }
  let family;
  try { family = fontFullName(file); } catch (e) { console.error(e.message); process.exit(2); }
  font = { path: file, file: basename(file), family, bold: 0, size: Number(flags.size) || 0.05 };
} else {
  font = FONTS[flags.font || 'cairo'];
  if (!font) { console.error(`--font must be one of ${Object.keys(FONTS).join(', ')}, thmanyah, or use --font-file <path>`); process.exit(1); }
}

const video = resolve(videoArg), out = resolve(outArg);
const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', video], { encoding: 'utf8' });
if (probe.status !== 0) { console.error(probe.stderr); process.exit(1); }
const pj = JSON.parse(probe.stdout);
const W = pj.streams[0].width, H = pj.streams[0].height;

// ── colours ──────────────────────────────────────────────────────────────────
const hex = h => /^#?[0-9a-f]{6}$/i.test(String(h || '')) ? String(h).replace('#', '').toUpperCase() : null;
const lum = h => { const n = parseInt(h, 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
let palette = { text: 'F3EBDD', outline: '0E0E0E', accent: 'C6F432' };
try {
  let brandDir = flags.brand;
  if (!brandDir) {
    const home = process.env.MOTION_DIRECTOR_HOME || join(homedir(), 'motion-director');
    const prof = join(home, 'profile.json');
    if (existsSync(prof)) brandDir = JSON.parse(readFileSync(prof, 'utf8')).brand;
  }
  const bj = brandDir && [join(brandDir, 'brand.json'), join(brandDir, 'brand', 'brand.json')].find(existsSync);
  if (bj) {
    const c = JSON.parse(readFileSync(bj, 'utf8')).colors || {};
    const all = Object.values(c).map(hex).filter(Boolean);
    if (all.length >= 2) {
      const sorted = [...all].sort((a, b) => lum(a) - lum(b));
      palette.outline = sorted[0];
      palette.text = sorted[sorted.length - 1];
      const acc = hex(c.accent) || hex(c.accent2);
      if (acc && Math.abs(lum(acc) - lum(palette.outline)) > 0.25) palette.accent = acc;
      console.log(`brand colours from ${bj}`);
    }
  }
} catch (e) { console.log(`brand colours not read (${e.message}); using defaults`); }
for (const k of ['text', 'outline', 'accent']) if (hex(flags[k])) palette[k] = hex(flags[k]);
const ass = h => `&H00${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`;

// ── chunks ───────────────────────────────────────────────────────────────────
const doc = JSON.parse(readFileSync(resolve(wordsArg), 'utf8'));
const words = (doc.words || []).map(w => ({ text: String(w.text).replace(/[{}\\]/g, '').trim(), start: +w.start, end: +w.end }))
  .filter(w => w.text && w.end > w.start).sort((a, b) => a.start - b.start);
if (!words.length) { console.error('no words in ' + wordsArg); process.exit(1); }
// Keep runs of Latin words and numbers ("Windows 11", "RTX 4090") as one token: an override tag between
// them splits the bidi run and libass would then reorder them inside an Arabic line.
const latin = s => !/[؀-ۿ]/.test(s) && /[A-Za-z0-9]/.test(s);
const arabicShare = words.filter(w => /[؀-ۿ]/.test(w.text)).length / words.length;
for (let i = words.length - 1; i > 0 && arabicShare > 0.3; i--) {
  if (latin(words[i].text) && latin(words[i - 1].text) && words[i].start - words[i - 1].end < 0.35
      && (words[i - 1].text + ' ' + words[i].text).split(' ').length <= 3) {
    words[i - 1] = { text: words[i - 1].text + ' ' + words[i].text, start: words[i - 1].start, end: words[i].end };
    words.splice(i, 1);
  }
}
const maxWords = Number(flags.words || 3), maxDur = 1.8, maxChars = Number(flags.chars || 24), gapBreak = 0.35;
const chunks = [];
let cur = [];
const close = () => { if (cur.length) chunks.push(cur); cur = []; };
for (const w of words) {
  const prev = cur[cur.length - 1];
  const len = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
  if (prev && (w.start - prev.end > gapBreak || cur.length >= maxWords || w.end - cur[0].start > maxDur || len > maxChars)) close();
  cur.push(w);
  if (/[.!?؟،,…:]$/.test(w.text)) close();
}
close();

// ── ASS ──────────────────────────────────────────────────────────────────────
const t = s => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = (s % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${sec}`; };
const size = Math.round(H * Number(flags.size || font.size) * (W / H > 1 ? 1.6 : 1));
const yFrac = Number(flags.y || 0.70);
const outlinePx = Math.max(3, Math.round(size * 0.09));
const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${font.family},${size},${ass(palette.text)},${ass(palette.accent)},${ass(palette.outline)},&H64000000&,${font.bold ? -1 : 0},0,0,0,100,100,0,0,1,${outlinePx},${Math.round(outlinePx * 0.6)},5,${Math.round(W * 0.08)},${Math.round(W * 0.08)},0,-1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
const lines = [];
const srt = [];
const alignRight = flags.align === 'right';
const px = alignRight ? Math.round(W * 0.92) : Math.round(W / 2), py = Math.round(H * yFrac);
const an = alignRight ? 6 : 5;
chunks.forEach((c, ci) => {
  const next = chunks[ci + 1];
  const cStart = c[0].start;
  const cEnd = Math.min(c[c.length - 1].end + 0.25, next ? next[0].start : Infinity);
  srt.push(`${ci + 1}\n${t(cStart).replace(/^(\d):/, '0$1:').replace('.', ',')}0 --> ${t(cEnd).replace(/^(\d):/, '0$1:').replace('.', ',')}0\n${c.some(w => /[\u0600-\u06FF]/.test(w.text)) ? '\u200F' : ''}${c.map(w => w.text).join(' ')}\n`);
  c.forEach((w, i) => {
    const s = i === 0 ? cStart : w.start;
    const e = i === c.length - 1 ? cEnd : c[i + 1].start;
    if (e - s < 0.02) return;
    const enter = i === 0 ? `\\fscx82\\fscy82\\t(0,110,\\fscx100\\fscy100)` : '';
    const body = c.map((x, j) => j === i
      ? `{\\c${ass(palette.accent)}\\fscx108\\fscy108}${x.text}{\\c${ass(palette.text)}\\fscx100\\fscy100}`
      : x.text).join(' ');
    const rtl = c.some(x => /[؀-ۿ]/.test(x.text)) ? '‏' : '';
    lines.push(`Dialogue: 0,${t(s)},${t(e)},Cap,,0,0,0,,{\\an${an}\\pos(${px},${py})${enter}}${rtl}${body}`);
  });
});

const base = join(dirname(out), basename(out, extname(out)));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(base + '.ass', '﻿' + header + lines.join('\n') + '\n');
writeFileSync(base + '.srt', srt.join('\n'));
console.log(`${words.length} words -> ${chunks.length} caption chunks, font "${font.family}" (${font.file}), align ${alignRight ? 'right' : 'center'}, text #${palette.text} accent #${palette.accent} outline #${palette.outline}`);
if (flags['no-burn']) { console.log(base + '.ass'); process.exit(0); }

// Burn: run ffmpeg from the output folder with relative paths, which avoids Windows drive-letter escaping in filters.
const work = dirname(out);
const fdir = join(work, '_fonts');
mkdirSync(fdir, { recursive: true });
for (const f of readdirSync(join(SKILL, 'fonts')).filter(f => f.endsWith('.ttf'))) copyFileSync(join(SKILL, 'fonts', f), join(fdir, f));
if (font.path) copyFileSync(font.path, join(fdir, font.file));
const r = spawnSync('ffmpeg', ['-v', 'error', '-stats', '-y', '-i', video, '-vf', `ass=${basename(base)}.ass:fontsdir=_fonts:shaping=complex`,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', String(flags.crf || 18), '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', basename(out)],
  { cwd: work, stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
console.log(out);
