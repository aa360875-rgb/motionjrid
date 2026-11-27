#!/usr/bin/env python3
"""Speech / silence detection for any video or audio file with Earshot (pip install earshot numpy).

  python vad.py <media> [--out speech.json] [--edl edl.json] [--cut out.mp4]
                [--threshold 0.5] [--min-silence 0.30] [--min-speech 0.20] [--pad-start 0.08] [--pad-end 0.12]

Writes speech.json: {duration, speech: [{start, end}], silences: [{start, end}], speech_seconds, silence_seconds}.
--edl writes the speech ranges as {"segments": [{start, end, note}]} (the reel-cutter / ali-reel EDL format).
--cut renders the file with every silence removed (video re-encoded H.264, audio AAC, tiny fades at each join).
The original file is never modified.
"""
import argparse, json, os, re, subprocess, sys, tempfile

try:
    import numpy as np
    import earshot
except ImportError:
    sys.exit('Earshot is not installed. Run:  pip install earshot numpy')

RATE, FRAME = 16000, 256          # Earshot works on 16 ms frames at 16 kHz
STEP = FRAME / RATE


def load_audio(path):
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1', '-ar', str(RATE), '-f', 's16le', '-']
    raw = subprocess.run(cmd, capture_output=True, check=False)
    if raw.returncode != 0:
        sys.exit(f'ffmpeg could not read {path}:\n{raw.stderr.decode(errors="replace")[-1500:]}')
    return np.frombuffer(raw.stdout, dtype=np.int16)


def scores_for(audio):
    det = earshot.Detector()
    n = len(audio) // FRAME
    out = np.empty(n, dtype=np.float32)
    for i in range(n):
        out[i] = det.predict_i16(audio[i * FRAME:(i + 1) * FRAME])
    return out


def segment(scores, duration, threshold, min_silence, min_speech, pad_start, pad_end):
    """Hysteresis on smoothed scores, then merge short gaps, drop short blips, pad, clamp."""
    if len(scores) == 0:
        return []
    k = 5
    smooth = np.convolve(scores, np.ones(k) / k, mode='same')
    on, off = threshold, max(0.05, threshold - 0.15)
    segs, start, active = [], 0.0, False
    for i, s in enumerate(smooth):
        t = i * STEP
        if not active and s >= on:
            active, start = True, t
        elif active and s < off:
            active = False
            segs.append([start, t])
    if active:
        segs.append([start, len(smooth) * STEP])
    merged = []
    for a, b in segs:
        if merged and a - merged[-1][1] < min_silence:
            merged[-1][1] = b
        else:
            merged.append([a, b])
    merged = [s for s in merged if s[1] - s[0] >= min_speech]
    out = []
    for a, b in merged:
        a, b = max(0.0, a - pad_start), min(duration, b + pad_end)
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return [{'start': round(a, 3), 'end': round(b, 3)} for a, b in out]


def ffmpeg_major():
    try:
        m = re.search(r'ffmpeg version n?(\d+)', subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True).stdout)
        return int(m.group(1)) if m else 7
    except Exception:
        return 7


def cut(media, speech, out_path):
    has_video = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=index',
                                '-of', 'csv=p=0', media], capture_output=True, text=True).stdout.strip() != ''
    parts, labels = [], []
    for i, s in enumerate(speech):
        a, b = s['start'], s['end']
        d = b - a
        f = min(0.012, d / 4)
        if has_video:
            parts.append(f'[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS[v{i}]')
        parts.append(f'[0:a]atrim=start={a:.3f}:end={b:.3f},asetpts=PTS-STARTPTS,'
                     f'afade=t=in:d={f:.3f},afade=t=out:st={max(0, d - f):.3f}:d={f:.3f}[a{i}]')
        labels.append(f'[v{i}][a{i}]' if has_video else f'[a{i}]')
    v = 1 if has_video else 0
    parts.append(''.join(labels) + f'concat=n={len(speech)}:v={v}:a=1' + ('[vo][ao]' if has_video else '[ao]'))
    graph = ';\n'.join(parts)
    fd, gfile = tempfile.mkstemp(suffix='.txt', prefix='vad-graph-')
    with os.fdopen(fd, 'w') as fh:
        fh.write(graph)
    opt = ['-/filter_complex', gfile] if ffmpeg_major() >= 7 else ['-filter_complex_script', gfile]
    cmd = ['ffmpeg', '-v', 'error', '-stats', '-y', '-i', media, *opt]
    cmd += (['-map', '[vo]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p'] if has_video else [])
    cmd += ['-map', '[ao]', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out_path]
    r = subprocess.run(cmd)
    os.remove(gfile)
    if r.returncode != 0:
        sys.exit('ffmpeg failed while cutting')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('media')
    ap.add_argument('--out')
    ap.add_argument('--edl')
    ap.add_argument('--cut')
    ap.add_argument('--threshold', type=float, default=0.5)
    ap.add_argument('--min-silence', type=float, default=0.30)
    ap.add_argument('--min-speech', type=float, default=0.20)
    ap.add_argument('--pad-start', type=float, default=0.08)
    ap.add_argument('--pad-end', type=float, default=0.12)
    a = ap.parse_args()

    media = os.path.abspath(a.media)
    if not os.path.exists(media):
        sys.exit(f'{media} not found')
    if a.cut and os.path.abspath(a.cut) == media:
        sys.exit('--cut must not overwrite the original file')
    audio = load_audio(media)
    duration = len(audio) / RATE
    speech = segment(scores_for(audio), duration, a.threshold, a.min_silence, a.min_speech, a.pad_start, a.pad_end)
    silences, prev = [], 0.0
    for s in speech:
        if s['start'] > prev:
            silences.append({'start': round(prev, 3), 'end': s['start']})
        prev = s['end']
    if duration > prev:
        silences.append({'start': round(prev, 3), 'end': round(duration, 3)})
    talk = sum(s['end'] - s['start'] for s in speech)
    doc = {'file': media, 'engine': f'earshot {earshot.__version__}', 'duration': round(duration, 3),
           'settings': {k: getattr(a, k) for k in ('threshold', 'min_silence', 'min_speech', 'pad_start', 'pad_end')},
           'speech_seconds': round(talk, 2), 'silence_seconds': round(duration - talk, 2),
           'speech': speech, 'silences': silences}
    out = a.out or os.path.splitext(media)[0] + '.speech.json'
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, indent=1)
    print(f'{len(speech)} speech segments, {talk:.1f}s speech / {duration - talk:.1f}s silence of {duration:.1f}s -> {out}')
    if a.edl:
        with open(a.edl, 'w', encoding='utf-8') as fh:
            json.dump({'segments': [dict(s, note='speech') for s in speech]}, fh, indent=1)
        print(f'EDL: {a.edl}')
    if a.cut:
        if not speech:
            sys.exit('no speech found, nothing to cut')
        cut(media, speech, os.path.abspath(a.cut))
        print(f'cut: {os.path.abspath(a.cut)}')


if __name__ == '__main__':
    main()
