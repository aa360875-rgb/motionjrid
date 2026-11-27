#!/usr/bin/env node
// Search and download openly licensed images and audio (music, sound effects) from Openverse (api.openverse.org).
//
//   node openverse.mjs search audio "calm tech" [--category music|sound_effect] [--commercial] [--n 20] [--out results.json]
//   node openverse.mjs search images "keyboard desk" [--commercial] [--n 20] [--out results.json]
//   node openverse.mjs get results.json 1,4,7 [--dir media]
//
// search prints a numbered list and saves the results; get downloads the chosen numbers and appends their
// attribution to <dir>/CREDITS.md. --commercial keeps only licenses that allow commercial use AND modification
// (cc0, pdm, by, by-sa), which is what a monetised social video needs. No API key; anonymous use is rate limited.
import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const argv = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2), v = argv[i + 1]; if (v === undefined || v.startsWith('--')) flags[k] = true; else { flags[k] = v; i++; } }
  else pos.push(argv[i]);
}
const API = 'https://api.openverse.org/v1';
const UA = { 'User-Agent': 'openverse-skill/1.0 (Claude Code)' };
const usage = () => { console.error('usage:\n  node openverse.mjs search <audio|images> "<query>" [--category music] [--commercial] [--n 20] [--out results.json]\n  node openverse.mjs get <results.json> <1,2,3> [--dir media]'); process.exit(1); };

async function getJson(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
  if (r.status === 429) throw new Error('Openverse rate limit reached; wait a minute and try again');
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return r.json();
}
const mmss = ms => { if (!ms) return ''; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const credit = x => x.attribution || `"${x.title}" by ${x.creator || 'unknown'}, ${(x.license || '').toUpperCase()} ${x.license_version || ''} (${x.license_url || ''}), via Openverse: ${x.foreign_landing_url || ''}`;

const [cmd] = pos;
if (cmd === 'search') {
  const kind = pos[1], q = pos[2];
  if (!['audio', 'images'].includes(kind) || !q) usage();
  const p = new URLSearchParams({ q, page_size: String(Math.min(Number(flags.n || 20), 50)), mature: 'false' });
  if (flags.commercial) p.set('license', 'cc0,pdm,by,by-sa');
  if (flags.category) p.set('category', String(flags.category));
  const data = await getJson(`${API}/${kind}/?${p}`);
  const rows = (data.results || []).map((x, i) => ({
    n: i + 1, id: x.id, title: x.title, creator: x.creator, license: `${x.license} ${x.license_version || ''}`.trim(),
    duration: mmss(x.duration), size: x.width ? `${x.width}x${x.height}` : '', filetype: x.filetype || extname(String(x.url || '')).slice(1),
    url: x.url, page: x.foreign_landing_url, attribution: credit(x),
  }));
  const out = resolve(String(flags.out || `openverse-${kind}.json`));
  writeFileSync(out, JSON.stringify({ kind, query: q, commercial: !!flags.commercial, results: rows }, null, 1));
  console.log(`${data.result_count ?? rows.length} found, showing ${rows.length}${flags.commercial ? ' (commercial use + modification allowed)' : ''}`);
  for (const r of rows) console.log(`${String(r.n).padStart(2)}. ${r.title || '(untitled)'} | ${r.creator || '?'} | ${r.license} | ${r.duration || r.size} ${r.filetype} | ${r.page}`);
  console.log(`saved: ${out}`);
} else if (cmd === 'get') {
  const file = pos[1], picks = String(pos[2] || '').split(',').map(Number).filter(Boolean);
  if (!file || !picks.length || !existsSync(file)) usage();
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const dir = resolve(String(flags.dir || 'media'));
  mkdirSync(dir, { recursive: true });
  for (const n of picks) {
    const r = doc.results.find(x => x.n === n);
    if (!r) { console.log(`#${n}: not in ${file}`); continue; }
    const ext = r.filetype ? `.${r.filetype}` : (extname(new URL(r.url).pathname) || '.bin');
    const name = `${doc.kind === 'audio' ? 'audio' : 'image'}-${n}-${String(r.title || r.id).replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}${ext}`;
    const res = await fetch(r.url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(120000) });
    if (!res.ok) { console.log(`#${n}: download failed (${res.status}); open the source page instead: ${r.page}`); continue; }
    let target = join(dir, name), k = 2;
    while (existsSync(target)) target = join(dir, name.replace(/(\.[^.]+)$/, `-${k++}$1`));
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    appendFileSync(join(dir, 'CREDITS.md'), `- ${target.split(/[\\/]/).pop()}: ${r.attribution}\n`);
    console.log(`#${n} -> ${target}`);
  }
  console.log(`credits: ${join(dir, 'CREDITS.md')}`);
} else usage();
