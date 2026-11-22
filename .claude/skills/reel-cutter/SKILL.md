---
name: reel-cutter
description: Turn a long raw talking-to-camera recording (5-20 minutes, Arabic or English) into a tight 30-90 second vertical reel. Transcribes with word timings, finds the best ideas and the strongest hook, drops retakes, false starts, stumbles, filler and dead air, shows a cut list for approval, then renders a 9:16 MP4 with loud-normalised audio plus a re-timed transcript for captions. Use when someone gives a long raw video and wants a Reel, TikTok or Short cut from it, asks to "cut the silences", "remove my mistakes", "pick the best parts", "make a reel from this", or similar. Hands off to caption-animation, talking-head-b-roll or motion-director for captions and graphics afterwards.
---

# reel-cutter

Raw recording in, a tight vertical reel out. You are the editor: the scripts do the measuring and the cutting, you do the judgement.

Scripts live in `scripts/` (Node 18+, no npm dependencies, need `ffmpeg`/`ffprobe` on PATH). Run them as `node <skill>/scripts/<name>.mjs`. They work on Windows, macOS and Linux.

## 0. Setup (first run on a machine)

Transcription is local whisper.cpp, no API key. Check with `node scripts/transcribe.mjs --check`. If it fails:

- **Windows:** download the latest whisper.cpp release from github.com/ggml-org/whisper.cpp/releases: the `whisper-cublas-*-bin-x64.zip` build if the machine has an NVIDIA GPU (`nvidia-smi` works), otherwise `whisper-bin-x64.zip`. Unzip to `%USERPROFILE%\whisper`. Set `WHISPER_BIN` to the full path of `whisper-cli.exe` inside it (user environment variable), or pass `--bin`.
- **macOS:** `brew install whisper-cpp`.
- **Model (all systems):** download `ggml-large-v3-turbo.bin` (about 1.6 GB, best for Arabic dialect) from huggingface.co/ggerganov/whisper.cpp into `~/.cache/whisper/` (`%USERPROFILE%\.cache\whisper\` on Windows). On a slow CPU-only machine use `ggml-medium.bin` instead.

Tell the user what you are downloading and how big it is before you start.

## 1. Transcribe

    node scripts/transcribe.mjs <video> --language ar --out <work>/transcript.json

Use `--language en` for English, `auto` if unsure. Writes word times and sentence lines, and prints the lines with times. Also run:

    node scripts/silences.mjs <video> --out <work>/silences.json

Work folder: `<video name>-reel/` next to the video. A 15 minute recording takes a few minutes on a GPU and 10-20 minutes on CPU: say so, then wait.

## 2. Read it like an editor

Read the whole transcript. Then mark, in your own notes:

1. **Retakes.** The same sentence or idea said two or more times in a row (often after a pause or "خلي اعيدها", "لا لا", "sorry", "again"). Keep the LAST complete, clean take; drop the earlier ones.
2. **False starts and stumbles.** A sentence that stops mid-way and restarts, a repeated word ("هذا هذا"), a corrected word. Cut back to the clean restart.
3. **Filler.** يعني، اممم، اه، شنو اسمه، um, uh, like at the start of a clause. Cut them only where the word timings leave a clean gap; never cut inside a word.
4. **Dead air.** The cut script removes pauses longer than `--max-gap` inside your ranges automatically, so do not micro-manage silences.
5. **Off-topic and talking to the crew.** Drop.
6. **Ideas.** List the distinct ideas/tips in the recording, each with its best take's time range and a one-line summary.

Whisper can mis-hear dialect. When a line reads as nonsense, judge by its neighbours and timing, and say so in the plan rather than guessing silently.

## 3. Propose the reel, then WAIT

Target length comes from the user; if they gave none, aim for 45-60 s. Build the reel as:

- **Hook (first 1-3 s):** the most surprising, useful or bold line in the whole recording, even if it was said late. It must make sense without context.
- **Body:** the 2-5 strongest ideas, in an order that flows, each trimmed to its core.
- **End:** a payoff or call to action if one exists in the footage. Do not invent lines; you can only use what was said.

If the recording holds more than one reel's worth of good ideas, propose up to 3 separate reels instead of cramming.

Show the user a table per reel: `# | source time | text (as spoken) | why`, the estimated length, and what you cut (retakes, stumbles, off-topic) in one short list. **Do not render before the user approves.** Revise as often as they ask.

## 4. Cut

Write `<work>/edl.json`:

```json
{ "segments": [
    { "start": 412.30, "end": 418.90, "note": "hook" },
    { "start": 35.10,  "end": 61.75,  "note": "idea 1, take 3" }
] }
```

Times are SOURCE seconds, taken from word times (start = first kept word's start, end = last kept word's end). Segments play in the order listed, so the hook can come from late in the video. Then:

    node scripts/cut.mjs <video> <work>/edl.json <work>/reel.mp4 --transcript <work>/transcript.json --max-gap 0.35 --aspect 9:16

- `--max-gap` splits each segment wherever words are silent for longer than this, removing the pause (0.25 punchy, 0.35 natural, 0.5 calm). Needs `--transcript`.
- `--aspect 9:16` centre-crops a landscape source; a vertical source is just scaled to 1080x1920. `--aspect keep` leaves the frame alone. `--focus 0.0-1.0` shifts the crop horizontally if the speaker is off-centre.
- Audio is loudness-normalised to -14 LUFS, with tiny fades at every cut so nothing clicks.
- It also writes `reel.words.json` (the transcript re-timed to the reel) and `reel.cuts.json` (every output segment and where it came from).

## 5. Check before handing over

    node scripts/contact.mjs <work>/reel.mp4

Look at the sheet (a frame every second). Check: no jump that lands mid-blink or mid-gesture in a jarring way, the speaker stays in frame after the crop, the first frame is a good one. Listen-check you cannot do, so read `reel.words.json` back in order: the sentences must read naturally with nothing cut mid-word. Fix the EDL and re-cut if not.

## 6. Hand over, then offer the next step

Give the MP4 path, its length, and the table of what is in it. Then offer:

- **Captions:** `caption-animation` with `reel.words.json` (already re-timed, word-level).
- **Graphics on top:** `talking-head-b-roll` or `motion-director` moves on the finished reel.
- **Another reel** from the unused ideas.

## Working with Herk Edit Kit

`transcript.json` is already in the Herk Edit Kit format (`text`, `audio_duration_secs`, `words[{text,start,end,type}]` in source seconds). Inside a herk-edit-kit checkout, use it in place of ElevenLabs: hand it to `cut-silences` / `cut-mistakes` / `short-form-edit` as the source transcript, so no paid transcription is needed.

## Rules

- Never invent speech, never reorder words inside a sentence, never cut inside a word.
- Jump cuts between sentences are normal for Reels; do not try to hide them with effects unless asked.
- Keep the user's voice and dialect; do not "correct" what they said in captions beyond fixing Whisper's mistakes.
- Long recordings: keep `transcript.json` and reuse it for every reel from the same video; do not re-transcribe.
