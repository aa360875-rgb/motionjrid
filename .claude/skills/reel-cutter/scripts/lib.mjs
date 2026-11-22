import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export const isWin = process.platform === 'win32';

export function args(argv = process.argv.slice(2)) {
  const flags = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2), v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) flags[k] = true; else { flags[k] = v; i++; }
    } else pos.push(a);
  }
  return { flags, pos };
}

export function which(name) {
  const exts = isWin ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    for (const e of exts) {
      const p = join(dir, name + e);
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}

export function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: 'utf8', maxBuffer: 1 << 30, ...opts });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  return r;
}

export function must(cmd, argv, opts) {
  const r = run(cmd, argv, opts);
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}):\n${(r.stderr || '').slice(-2000)}`);
  return r;
}

export function probe(file) {
  const r = must('ffprobe', ['-v', 'error', '-show_entries',
    'stream=codec_type,width,height,avg_frame_rate:stream_side_data=rotation:format=duration', '-of', 'json', file]);
  const j = JSON.parse(r.stdout);
  const v = j.streams.find(s => s.codec_type === 'video');
  const hasAudio = j.streams.some(s => s.codec_type === 'audio');
  let width = v?.width, height = v?.height;
  const rot = Math.abs(Number(v?.side_data_list?.find(d => d.rotation !== undefined)?.rotation || 0));
  if (rot === 90 || rot === 270) [width, height] = [height, width];
  const [n, d] = String(v?.avg_frame_rate || '30/1').split('/').map(Number);
  return { width, height, fps: Math.round((n / (d || 1)) * 100) / 100, duration: Number(j.format.duration), hasAudio, hasVideo: !!v };
}

export const fmt = s => {
  const m = Math.floor(s / 60), r = (s - m * 60).toFixed(2).padStart(5, '0');
  return `${m}:${r}`;
};
