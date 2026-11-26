---
name: remotion
description: Short entry point for Remotion (videos written as React code). Use when the user types /remotion with any task - create, preview, add captions or elements, render or export. It picks the matching official remotion-* skill and follows it.
argument-hint: "[task, e.g. create a 9:16 intro, render, add captions]"
---

# remotion

The official Remotion skills are installed as separate skills next to this one. Read the one that matches the task, in full, and follow it. Start with `remotion-best-practices` when unsure; it routes to the rest.

| Task | Skill to read |
|---|---|
| Start a new video or project | `remotion-create` |
| Animation, layout, effects, content | `remotion-markup` |
| Captions or transcription | `remotion-captions` |
| Ready-made titles, backgrounds, charts, caption styles | `remotion-elements` |
| Preview in Remotion Studio | `remotion-studio` |
| Export MP4, stills or a timeline | `remotion-render` |
| Editable layers in Studio | `remotion-interactivity` |
| Audio/video file handling | `remotion-multimedia` |
| Map animations | `remotion-maps` |
| Look something up | `remotion-docs` |
| Upgrade Remotion | `remotion-upgrade` |
| Build an app on Remotion | `remotion-saas` |
| License questions | `remotion-license` |

The skills live in `~/.claude/skills/<name>/SKILL.md` (`%USERPROFILE%\.claude\skills\` on Windows). If the one you need is missing, say so instead of guessing its contents.

Ali Tech rules on top: Arabic text right to left with letters joined and mixed Arabic/English in the right order; Thmanyah font when its .otf is available, and say which font file was actually loaded; elements enter from the right; never modify the user's original footage; check the render before reporting it done.
