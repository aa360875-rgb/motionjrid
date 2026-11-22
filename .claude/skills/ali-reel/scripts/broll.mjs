#!/usr/bin/env node
// Lay the user's own filmed B-roll over the cut reel, grade it, and add transitions. One ffmpeg pass.
//
//   node broll.mjs <reel.mp4> <plan.json> <out.mp4> [--cuts reel.cuts.json] [--punch 1.1] [--fade 0.12]
//                  [--grade log|soft|none] [--lut file.cube] [--grade-face] [--overlay graphics.mov]
//
// plan.json: { "cutaways": [ { "clip": "C007.MP4", "at": 3.2, "dur": 2.5, "from": 0.0, "note": "typing" }, ... ] }
//   at   = reel time (seconds) the cutaway starts      dur  = how long it covers the speaker
//   from = second inside the clip to start from        clip = path, relative to plan.json's folder
// Output: the reel with every cutaway on top (sound muted, 9:16 crop, graded, short fade in/out),
// alternating punch-in zoom on the speaker's jump cuts (needs --cuts), the reel's own audio.
// Writes <out>.check.jpg: one frame from the middle of every cutaway, so you can confirm they are really there.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname, join, basename, extname, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) { const k = argv[i].slice(2), v = argv[i + 1]; if (v === undefined || v.startsWith('--')) flags[k] = true; else { flags[k] = v; i++; } }
  else pos.push(argv[i]);
}
const [reelArg, planArg, outArg] = pos;
if (!reelArg || !planArg || !outArg) { console.error('usage: node broll.mjs <reel.mp4> <plan.json> <out.mp4> [--cuts reel.cuts.json] [--grade log|soft|none] [--lut f.cube]'); process.exit(1); }

const run = (cmd, a, o = {}) => { const r = spawnSync(cmd, a, { encoding: 'utf8', maxBuffer: 1 << 30, ...o }); if (r.error) throw r.error; return r; };
const probe = f => {
  const r = run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,avg_frame_rate:stream_side_data=rotation:format=duration', '-of', 'json', f]);
  if (r.status !== 0) throw new Error(`ffprobe ${f}: ${r.stderr}`);
  const j = JSON.parse(r.stdout), v = j.streams.find(s => s.codec_type === 'video');
  let w = v.width, h = v.height;
  const rot = Math.abs(Number(v.side_data_list?.find(d => d.rotation !== undefined)?.rotation || 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w];
  const [n, d] = String(v.avg_frame_rate || '30/1').split('/').map(Number);
  return { w, h, fps: n / (d || 1), duration: Number(j.format.duration) };
};

const reel = resolve(reelArg), out = resolve(outArg), planPath = resolve(planArg);
const R = probe(reel);
const W = R.w, H = R.h, FPS = Math.round(R.fps) || 30;
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const cuts = (plan.cutaways || []).map((c, i) => {
  const clip = isAbsolute(c.clip) ? c.clip : join(dirname(planPath), c.clip);
  if (!existsSync(clip)) throw new Error(`cutaway ${i + 1}: ${clip} not found`);
  const info = probe(clip);
  const at = Number(c.at), dur = Number(c.dur), from = Number(c.from || 0);
  if (!(dur > 0) || at < 0 || at + dur > R.duration + 0.05) throw new Error(`cutaway ${i + 1}: at ${at} + dur ${dur} is outside the reel (${R.duration.toFixed(2)}s)`);
  if (from + dur > info.duration + 0.05) throw new Error(`cutaway ${i + 1}: ${basename(clip)} is ${info.duration.toFixed(2)}s, cannot take ${dur}s from ${from}s`);
  return { ...c, clip, info, at, dur, from };
}).sort((a, b) => a.at - b.at);
for (let i = 1; i < cuts.length; i++) if (cuts[i].at < cuts[i - 1].at + cuts[i - 1].dur - 0.01) throw new Error(`cutaways ${i} and ${i + 1} overlap`);

// Colour: Log footage is flat and grey; bring it to normal contrast and saturation. A camera LUT is better when there is one.
const gradeMode = flags.lut ? 'lut' : String(flags.grade || 'log');
const lutName = flags.lut ? '__look.cube' : null;
if (flags.lut) writeFileSync(join(dirname(out), lutName), readFileSync(resolve(flags.lut)));
const grade = {
  lut: `lut3d=file=${lutName}`,
  log: 'curves=master=0/0 0.18/0.10 0.5/0.52 0.82/0.92 1/1,eq=saturation=1.45:contrast=1.08:gamma=0.97',
  soft: 'eq=contrast=1.06:saturation=1.12',
  none: null,
}[gradeMode];
if (grade === undefined) throw new Error('--grade must be log, soft or none');

const fade = Number(flags.fade ?? 0.12);
const cover = (w, h) => {           // scale + centre-crop a clip to fill W x H
  const s = Math.max(W / w, H / h);
  return `scale=${Math.ceil(w * s / 2) * 2}:${Math.ceil(h * s / 2) * 2}:flags=lanczos,crop=${W}:${H}`;
};

const inputs = ['-i', reel];
const chains = [];
let base = '[0:v]';
// Face grade (optional) and alternating punch-in on the speaker's jump cuts.
let pre = [];
if (flags['grade-face'] && grade) pre.push(grade);
pre.push(`fps=${FPS}`, 'format=yuv420p');
chains.push(`${base}${pre.join(',')}[b0]`);
base = '[b0]';
const punch = Number(flags.punch ?? 1.1);
if (flags.cuts && punch > 1) {
  const cj = JSON.parse(readFileSync(resolve(flags.cuts), 'utf8')).cuts || [];
  const odd = cj.filter((_, i) => i % 2 === 1).map(c => `between(t,${c.outStart.toFixed(3)},${(c.outEnd - 0.001).toFixed(3)})`);
  if (odd.length) {
    const cw = Math.round(W / punch / 2) * 2, ch = Math.round(H / punch / 2) * 2;
    chains.push(`${base}split[bA][bB]`);
    chains.push(`[bB]crop=${cw}:${ch}:(iw-${cw})/2:(ih-${ch})/2.6,scale=${W}:${H}:flags=lanczos[bz]`);
    chains.push(`[bA][bz]overlay=enable='${odd.join('+')}'[b1]`);
    base = '[b1]';
  }
}
cuts.forEach((c, i) => {
  const n = i + 1;
  inputs.push('-ss', c.from.toFixed(3), '-t', c.dur.toFixed(3), '-i', c.clip);
  const f = [cover(c.info.w, c.info.h), `fps=${FPS}`];
  if (grade) f.push(grade);
  f.push('format=yuva420p', `trim=duration=${c.dur.toFixed(3)}`, 'setpts=PTS-STARTPTS');
  if (fade > 0) f.push(`fade=t=in:st=0:d=${fade}:alpha=1`, `fade=t=out:st=${Math.max(0, c.dur - fade).toFixed(3)}:d=${fade}:alpha=1`);
  f.push(`setpts=PTS+${c.at.toFixed(3)}/TB`);
  chains.push(`[${n}:v:0]${f.join(',')}[c${n}]`);
  chains.push(`${base}[c${n}]overlay=eof_action=pass:enable='between(t,${c.at.toFixed(3)},${(c.at + c.dur).toFixed(3)})'[o${n}]`);
  base = `[o${n}]`;
});
if (flags.overlay) {
  const k = cuts.length + 1;
  inputs.push('-i', resolve(flags.overlay));
  chains.push(`[${k}:v:0]format=yuva420p[gfx]`);
  chains.push(`${base}[gfx]overlay=eof_action=pass[og]`);
  base = '[og]';
}
chains.push(`${base}format=yuv420p[vout]`);

const graph = join(dirname(out), basename(out, extname(out)) + '.broll-filter.txt');
writeFileSync(graph, chains.join(';\n'));
console.log(`${cuts.length} cutaways, grade ${gradeMode}${flags['grade-face'] ? ' (face too)' : ''}, punch-in ${flags.cuts ? punch : 'off'}`);
const r = run('ffmpeg', ['-v', 'error', '-stats', '-y', ...inputs, '-filter_complex_script', basename(graph), '-map', '[vout]', '-map', '0:a?',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', String(flags.crf ?? 18), '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', out],
  { cwd: dirname(out), stdio: ['ignore', 'inherit', 'pipe'] });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }

// Proof: a frame from the middle of each cutaway, in order, side by side.
if (cuts.length) {
  const sheet = join(dirname(out), basename(out, extname(out)) + '.check.jpg');
  const shots = [];
  cuts.forEach((c, i) => {
    const f = join(dirname(out), `__check${i}.png`);
    run('ffmpeg', ['-v', 'error', '-y', '-ss', (c.at + c.dur / 2).toFixed(3), '-i', out, '-frames:v', '1', '-vf', 'scale=240:-2', f]);
    if (existsSync(f)) shots.push(f);
  });
  if (shots.length) {
    const a = shots.flatMap(f => ['-i', f]);
    run('ffmpeg', ['-v', 'error', '-y', ...a, '-filter_complex', shots.length > 1 ? `hstack=inputs=${shots.length}` : 'null', sheet]);
    for (const f of shots) rmSync(f, { force: true });
    console.log(`check sheet (one frame per cutaway, in order): ${sheet}`);
  }
}
console.log(out);
