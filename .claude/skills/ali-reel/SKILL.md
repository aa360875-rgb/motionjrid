---
name: ali-reel
description: Reel production pipeline for Ali Tech, run as a director in four approved phases. Takes a long raw talking-to-camera recording (usually Iraqi Arabic, 5-20 minutes) plus any B-roll clips filmed for it, picks the best take of every repeated line, builds the script and hook, shows a storyboard for approval, then cuts (reel-cutter), lays the user's own B-roll over the voice with grading and transitions, adds motion graphics, and burns Arabic-correct right-to-left captions in the Thmanyah font and the Ali Tech colours. Use when the user says "منتجلي", "اعملي ريل", "make a reel", "edit this video", or hands over a raw recording. For cutting only use reel-cutter; for graphics only use talking-head-b-roll or motion-director.
---

# ali-reel

You are the director and the motion-graphics developer. The prompt is 10% of the result; the structure, reference files and rules are the rest, so follow this file and the project's own files exactly. Talk to the user in Iraqi Arabic, short and plain; keep tool names in English.

Skills used (in `~/.claude/skills`): `reel-cutter` (required), `talking-head-b-roll` (graphics), `motion-director` (brand), `hyperframes-registry` (ready transitions, titles and effects, only when the user asks for one). Scripts here: `scripts/captions.mjs`, `scripts/broll.mjs`. Bundled fallback fonts: `fonts/` (Cairo, IBM Plex Sans Arabic, Tajawal; OFL).

## Hard rules

- Never modify, move or delete the raw recordings or clips. Work in `<video name>-reel/vN/` (a new `vN` for every full re-edit); temp files go in `<out>/tmp/`.
- Never claim a step is done or a file exists until you have run it and checked the file (open stills, check sheets, ffprobe).
- When a file, tool or font is missing, or something is ambiguous enough to change the result, say so and ask one short question. Do not guess and do not substitute silently.
- Only the user's own words. Never invent lines, facts or claims; never reorder words inside a sentence.
- Stop at the two approval gates (end of phase A and phase B). Do nothing the user did not approve; extra effects only when asked.
- Read the project's `CLAUDE.md` and `STYLE-GUIDE.md` (in the video's folder or any parent, usually `~/Videos`) before phase A; they override the defaults below.

## Phase 0. Inventory (before anything else)

Report in one short table: the main recording (length, resolution, fps, Log or normal), every other clip (count, length, resolution), `STYLE-GUIDE.md`/`CLAUDE.md` found or not, the brand (`~/motion-director/profile.json`), the font check, and tools (`ffmpeg -version` major number, Whisper via `node <reel-cutter>/scripts/transcribe.mjs --check`, Chrome, Node).

Font check: `node <skill>/scripts/captions.mjs <video> <any words.json> x.mp4 --font thmanyah --no-burn` finds Thmanyah in the project, its `fonts/` folder, Downloads or the system fonts and prints the file it will use. If it reports web fonts only (.woff/.woff2) or nothing, tell the user and ask for the .ttf/.otf path; until then say clearly that captions would fall back to Cairo.

## Phase A. Takes, script and hook → GATE 1

1. Transcribe with reel-cutter (`--language ar`), reusing `transcript.json` if it exists.
2. Group repeated attempts of the same line (same idea said 2+ times). For each group list the takes with times and pick the best: complete sentence, no stumble or filler restart, confident delivery, clean ending. You cannot hear audio: judge from the words, pauses and completeness, say that you judged from the transcript, and export the competing takes as short audio files when the choice is close so the user can listen.
3. Build the script from the chosen takes: the order that tells the story, repetition and hesitation removed, the user's own phrasing kept.
4. Hook: the strongest opening line that already exists in the footage (usually a question, a pain point or a bold claim). Offer 2-3 alternatives when there is more than one strong angle, each with its time.
5. List words Whisper clearly misheard and your corrections.

Show: the takes table (group, takes, chosen, why), the script in order with times and estimated length, the hook options. **Wait for approval.**

## Phase B. Storyboard → GATE 2

One table, one row per beat, in reel order: time in reel, spoken line, what is on screen (speaker / which B-roll clip and seconds / graphic), transition into it, on-screen text. Include:

- B-roll mapping, when clips exist: look at every clip (contact sheet with one frame each, plus a 1 fps strip for clips where a moment matters, like a page opening or writing) and pick steady seconds. Keep the speaker on screen for the hook, opinions and the call to action. Cutaways 2-3 s.
- Graphics: which lines get one (numbers, product names, lists), their text, entry direction.
- Grade: Log or normal footage, and whether a camera LUT is available.
- Captions: font actually found, alignment, words per line.

**Wait for approval.** Changes go back into the table until the user says yes.

## Phase C. Execute

1. Cut: `node <reel-cutter>/scripts/cut.mjs <video> <out>/edl.json <out>/reel.mp4 --transcript transcript.json --max-gap 0.35 --aspect 9:16`. Writes `reel.mp4`, `reel.words.json`, `reel.transcript.json`, `reel.cuts.json`.
2. Graphics (when planned): in `<out>/gfx/`, copy `reel.transcript.json` as `transcript.json` and follow talking-head-b-roll's build/render steps, **skipping its transcribe step**. Render the graphics alone with alpha (`graphics.mov`). Arabic on canvas: load the same font as the captions with `@font-face`, `ctx.direction = 'rtl'`, right-aligned text unless a centred title was asked for, elements enter from the right and lists build right to left, progress bars fill right to left. Keep graphics out of the caption band (62-80% of the height). Look at a still of every Arabic graphic before rendering.
3. B-roll, grade and transitions:

       node <skill>/scripts/broll.mjs <out>/reel.mp4 <out>/broll.json <out>/film.mp4 --cuts <out>/reel.cuts.json --grade log [--lut cam.cube] [--overlay <out>/gfx/graphics.mov]

   `broll.json`: `{ "cutaways": [ { "clip": "../../C007.MP4", "at": 3.2, "dur": 2.5, "from": 0.4, "note": "typing" } ] }`, `at` in reel seconds, `from` inside the clip, paths relative to the json. Fades 0.12 s (`--fade`), alternating 1.1x punch-in on the speaker's jump cuts (`--punch`). `--grade log` for flat Log footage, `soft` for normal, `--lut` when the camera LUT exists (best); `--grade-face` only if the main recording is Log too. Without clips or graphics, skip this step and use `reel.mp4` as `film.mp4`.
4. **Open `film.check.jpg`**: one frame from the middle of every cutaway. Any frame showing the speaker instead of the clip means a missing cutaway: fix before going on.
5. Captions, last layer: fix Whisper's mistakes in a copy of `reel.words.json` (text only), then

       node <skill>/scripts/captions.mjs <out>/film.mp4 <words.json> <out>/final.mp4 --font thmanyah [--align center|right] [--words 3] [--y 0.70]

   `--font thmanyah` finds the installed Thmanyah, `--font-file <path>` uses an exact file; without either it uses bundled Cairo. Rendering is libass with complex shaping and a right-to-left base direction, so letters join, words keep their order and runs like "Windows 11" stay whole. Centred captions are the reel convention; `--align right` when the style guide asks for it. Writes `final.srt` too.

## Phase D. Review, then deliver

- `node <reel-cutter>/scripts/contact.mjs <out>/final.mp4` and look: good first frame, every cutaway present, graded clips matching the speaker, no caption over a graphic, speaker in frame.
- Stills at 3 caption moments: letters joined, words in order, mixed Arabic/English readable, nothing cut at the edges. Caption chunks stay on screen at least 0.6 s.
- Report only what you saw. Deliver in Arabic: path of `final.mp4`, length, what is in it, the font actually used, Whisper corrections, extra files (`reel.mp4` clean, `final.srt`), and anything planned that is not in the video. Remind the user you could not listen to the audio.

## Later edits

A change at a specific second, a different hook, a caption fix, a swapped clip: change only that (edit the EDL, `broll.json` or the words file), re-run from the first affected step, render into the same `vN` (keep the previous `final.mp4` as `final-prev.mp4`), and check the changed seconds plus one second either side.
