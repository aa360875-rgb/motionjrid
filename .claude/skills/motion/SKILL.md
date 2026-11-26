---
name: motion
description: Motion-design craft toolkit (iart-ai motion-design-skills), kept separate from the video-editing pipeline and run only when the user types /motion. Nine topics - animation principles and easing, logo animation, motion art direction, animated backgrounds, colour and grading for motion, shot composition and safe areas, beat-sync editing, Remotion videos, and Adobe After Effects (expressions, export, performance, project hygiene).
disable-model-invocation: true
argument-hint: "[topic or task, e.g. logo animation for Ali Tech]"
---

# motion

A standalone toolkit. It is not part of `ali-reel` and `ali-reel` never calls it; use it only for what the user asks here.

## Pick the topic

Read only the topic that matches the request (one, at most two). Each topic folder has a `GUIDE.md` (read it first, in full) and its own `references/`; resolve every path a guide mentions relative to that topic's folder (`topics/<topic>/`).

| Topic | Use it for |
|---|---|
| `topics/animation-principles/` | Motion that feels natural: easing curves, timing and duration, overshoot, stagger, anticipation, fixing stiff or robotic movement |
| `topics/logo-animation/` | Logo intros, outros, stingers, brand reveals, SVG draw-on, icon-to-wordmark morphs, splash and loader loops |
| `topics/motion-art-direction/` | The creative direction above techniques: motion language, tone, pacing, hierarchy, restraint, consistency across shots |
| `topics/motion-background/` | Animated backgrounds: mesh and gradient, shader and aurora, particles, seamless loops |
| `topics/color-motion/` | Palettes for motion, gradients, smooth colour interpolation (OKLCH), grading order, colour shifts after render |
| `topics/shot-composition/` | Grids, focal points, where elements enter and exit, parallax and camera moves, 16:9 / 9:16 / 1:1 safe areas |
| `topics/beat-sync-editing/` | Cutting to the beat, pacing, match cuts, J/L cuts, speed ramps, planning a sequence |
| `topics/remotion-video/` | Programmatic videos in React with Remotion: compositions, interpolate/spring, rendering |
| `topics/after-effects/` | Adobe After Effects: expressions and rigs, MOGRTs, export settings and alpha, performance, project organisation, ExtendScript |

If the request fits none of them, say so and suggest the closest skill instead of forcing one.

## House rules for Ali Tech (apply on top of every topic)

- Arabic text runs right to left (`direction: rtl; unicode-bidi: isolate;`), right-aligned unless a centred title is asked for; letters must join and mixed Arabic / English / numbers must read in the right order.
- Motion follows Arabic reading: elements enter from the right, lists and cards build right to left, progress bars fill right to left.
- Font: Thmanyah (.otf in the project folder or installed on Windows); never claim it was used unless the file was actually loaded. Colours: the Ali Tech brand from `~/motion-director/profile.json`.
- Never modify the user's original files; write outputs to a new folder and check every render before reporting it done.
