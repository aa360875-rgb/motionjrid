---
name: claude-animation-base
description: Hand-drawn character animation in p5.js + p5.brush (brush strokes, flat 2D, boiling linework) using the Claude Animation Base starter kit and its Clawd character. Use when asked for a hand-drawn or painterly animated short, a character animation, an animated mascot clip, or "make a video of Clawd ...". Renders headless to MP4. Not for UI demos, overlays or branded product promos (use motion-director for those).
---

# Claude Animation Base

Source: github.com/JohnHeibel/ClaudeAnimationBase (MIT), vendored at `tools/claude-animation-base/` in this repo.

1. `cd tools/claude-animation-base` and read `ANIMATION_GUIDE.md` in full before writing any scene. It holds the rules (handmade, alive, one piece, no text, transitions always, something happens in every scene), timing, and the full API for `src/clawd.js`, `src/core.js`, `src/timeline.js`.
2. First run only: `npm install`.
3. Storyboard first and show it to the user, then write the film in `src/scenes/` (use `src/scenes/demo.js` as the example) and set length and tempo in `src/config.js`.
4. Check your work with contact sheets and stills from `render.mjs` before the full render, then `node render.mjs --clip --out=out/video.mp4`.
5. In a container with no GPU add `--soft-gl`, and avoid the watercolour fills (seconds per frame in software GL); swap them for flat fills or brush strokes.
6. To use another character, keep the engine and replace Clawd: draw the new character with the same view/emotion API shape.
