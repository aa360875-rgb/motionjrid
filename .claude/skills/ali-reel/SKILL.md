---
name: ali-reel
description: One-request reel factory for Ali Tech. Takes a long raw talking-to-camera recording (usually Iraqi Arabic, 5-20 minutes) and delivers a finished 9:16 reel - cut tight with reel-cutter, optional motion graphics with talking-head-b-roll, and Arabic-correct word-by-word captions in the Ali Tech colours - stopping only to approve the cut plan. Use when the user says "اعملي ريل", "منتجلي هذا الفيديو", "make a reel from my video", "edit this video", hands over a raw recording, or asks for the whole edit at once. For only cutting use reel-cutter; for only graphics use talking-head-b-roll or motion-director.
---

# ali-reel

The user records long, unscripted takes and wants finished vertical reels without opening an editor. You run the whole chain and stop for approval once, at the cut plan. Talk to the user in Iraqi Arabic, short and plain; keep tool names in English.

Skills this uses (all must be installed in `~/.claude/skills`): `reel-cutter` (required), `talking-head-b-roll` (graphics, optional), `motion-director` (brand file, optional). Scripts here: `scripts/captions.mjs`. Fonts here: `fonts/` (Cairo, IBM Plex Sans Arabic, Tajawal, all OFL).

## Defaults (do not ask about these)

- Language Iraqi Arabic, format 9:16, length 45-60 s, captions on, graphics `light`.
- Brand colours from `~/motion-director/profile.json` -> its brand's `brand.json`; otherwise near-black, warm cream and lime.
- Output folder: `<video name>-reel/` next to the video. Never move or modify the original recording.

## 1. Find the video

If the user names a file, use it. If not, list the 6 newest `.mp4`/`.mov` files under `~/Videos` (recursively) and `~/Desktop`, with size, length (ffprobe) and date, and ask which one with the question tool. Ignore files under 30 seconds and exports that are clearly already edited (names containing `reel`, `final`, `export`).

## 2. Cut (reel-cutter)

Follow the `reel-cutter` skill sections 0-4 exactly: setup check, transcribe (`--language ar`; reuse `transcript.json` if it already exists), read like an editor, propose. In the same approval message also show:

- Graphics level: `none` / `light` (2-4 overlays at the strongest moments) / `full` (talking-head-b-roll's full plan). Default `light`.
- Any words Whisper clearly misheard, with your correction, so captions come out right.

**WAIT for approval.** Then cut with `cut.mjs ... --transcript transcript.json --max-gap 0.35 --aspect 9:16`. It writes `reel.mp4`, `reel.words.json` (captions) and `reel.transcript.json` (graphics).

## 3. Graphics (talking-head-b-roll), unless `none`

Work in `<out>/broll/`. Copy `reel.mp4` there as `talk.mp4` and `reel.transcript.json` as `transcript.json`. **Skip its transcribe step** (it does not work on Windows and the transcript already exists). Then follow its plan/build/render steps with these constraints:

- `light`: only B (overlay) treatments, 2-4 of them, on numbers, product/app names and lists. `full`: its normal A/B/C plan.
- Keep every overlay out of the caption band (y from 62% to 80% of the height).
- Colours from the brand. Arabic text on canvas: load `fonts/Cairo_900Black.ttf` with `@font-face`, set `ctx.direction = 'rtl'` and `textAlign = 'right'` (or centre), and look at a still of every Arabic graphic before rendering. If Arabic shaping looks wrong in any still, switch that graphic's text to English or to a number.
- It needs `npm i playwright-core` in `broll/` once, and Chrome.

Render `film.mp4` (reel + graphics, original sound). That file feeds the captions step.

## 4. Captions (last layer)

Before burning, fix Whisper's mistakes in a copy of `reel.words.json` (text only, never times), keeping the user's dialect spelling. Then:

    node <skill>/scripts/captions.mjs <film.mp4 or reel.mp4> <words.json> <out>/final.mp4

Options: `--font cairo|plex|tajawal` (default cairo), `--words 3` per chunk, `--y 0.70` vertical position, `--accent #hex`. It renders through libass with complex shaping, so Arabic letters join and lines run right to left; Latin runs such as "Windows 11" stay together. It also writes `final.srt` for DaVinci Resolve.

## 5. Check, then deliver

- `node <reel-cutter>/scripts/contact.mjs <out>/final.mp4` and look at the sheet: first frame is a good one, no caption collides with a graphic, the speaker stays in frame.
- Grab 3 stills at caption moments (`ffmpeg -ss <t> -i final.mp4 -frames:v 1`) and look: letters joined, words in the right order, nothing cut off at the edges.
- Fix and re-run the step that failed; do not hand over a file you have not looked at.

Deliver in Arabic: path of `final.mp4`, its length, a 3-line summary of what is in it, the list of Whisper corrections you made, and the extra files (`reel.mp4` clean without captions, `final.srt`). Then offer the next reel from the unused ideas in the same recording.
