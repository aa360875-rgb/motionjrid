#!/usr/bin/env node
// Contact sheet of a video: one frame per second (or --every s), 10 columns.
//   node contact.mjs <video> [--every 1] [--out sheet.png]
import { resolve, dirname, basename, extname, join } from 'node:path';
import { args, must, probe } from './lib.mjs';

const { flags, pos } = args();
if (!pos[0]) { console.error('usage: node contact.mjs <video> [--every 1] [--out sheet.png]'); process.exit(1); }
const video = resolve(pos[0]);
const every = Number(flags.every ?? 1);
const { duration } = probe(video);
const n = Math.max(1, Math.ceil(duration / every));
const cols = 10, rows = Math.ceil(n / cols);
const out = resolve(flags.out || join(dirname(video), basename(video, extname(video)) + '.sheet.png'));
must('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf',
  `fps=1/${every},scale=216:-2,drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6,tile=${cols}x${rows}:padding=4:color=black`,
  '-frames:v', '1', out]);
console.log(out);
