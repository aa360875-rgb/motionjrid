---
name: earshot-vad
description: Detect exactly where someone is speaking and where it is silent in any video or audio file, in any language, with Earshot (a fast, noise-robust voice activity detector), and optionally cut every silence out. Use when the user types /earshot-vad, asks to find or remove silences or dead air, wants speech timings without a transcript, or wants a tighter silence pass than transcript gaps give.
argument-hint: "[video file] [remove silences | just analyse]"
---

# earshot-vad

Script: `scripts/vad.py` (Python 3.8+, `ffmpeg` on PATH). Earshot itself is a pip package.

## Setup (once per machine)

    pip install earshot numpy

If `pip` is missing, Python is not installed: on Windows `winget install Python.Python.3.12`, then reopen the terminal. Check with `python -c "import earshot; print(earshot.__version__)"`.

## Use

Analyse only (writes `<file>.speech.json` next to the file: speech ranges, silence ranges, totals):

    python <skill>/scripts/vad.py "<video>"

Remove the silences into a new file (the original is never touched):

    python <skill>/scripts/vad.py "<video>" --cut "<folder>/<name>-nosilence.mp4"

Hand the speech ranges to another skill (reel-cutter / ali-reel EDL format):

    python <skill>/scripts/vad.py "<video>" --edl "<folder>/speech-edl.json"

Tuning, show the user what changed:

| Option | Default | Effect |
|---|---|---|
| `--min-silence` | 0.30 s | Pauses shorter than this are kept. 0.20 = punchy, 0.45 = relaxed |
| `--threshold` | 0.5 | Lower catches quiet speech and breaths, higher ignores background noise |
| `--min-speech` | 0.20 s | Drops clicks and short noises |
| `--pad-start` / `--pad-end` | 0.08 / 0.12 s | Air kept before and after each phrase so words are not clipped |

## Report

Say how many speech segments were found, seconds of speech vs silence, the output path, and the settings used. Then look at a few joins (`ffmpeg -ss <t> -i out.mp4 -frames:v 1`) and say you could not listen to the result: the user should check that no word start or end is clipped, and re-run with larger padding if one is.

It removes silence only. It does not remove repeated takes, stumbles or filler words; that needs the transcript (reel-cutter / ali-reel).
