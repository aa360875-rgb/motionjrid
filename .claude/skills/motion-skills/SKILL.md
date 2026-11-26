---
name: motion-skills
description: Catalogue and installer for the iArt motion-skills collection (github.com/iart-ai/motion-skills) - 19 packs of motion-graphics skills for TikTok/Reels, YouTube, explainers, data animation, maps, web animation, motion design, kinetic type, WebGL, Manim, lower thirds, b-roll and more. Use when the user types /motion-skills, asks which iArt motion skills exist or are installed, or asks to add one of these packs. It installs every skill of a pack as its own separate top-level skill, never nested inside another skill.
argument-hint: "[pack name to install, or empty to list]"
---

# motion-skills

The iArt collection is an index: each pack lives in its own GitHub repository and holds one or more skills under `skills/<name>/SKILL.md`.

## The 19 packs

| Pack | For | Skills |
|---|---|---|
| tiktok-video-skills | TikTok / Reels / Shorts: short-form structure, captions, countdowns, lower thirds | 4 |
| text-message-video-skills | Text-message story videos | 1 |
| youtube-video-skills | Podcasters and YouTubers | 2 |
| ecommerce-video-skills | Product and shop videos | 3 |
| ad-video-skills | Brand ads | 3 |
| data-animation-skills | Animated charts and numbers | 3 |
| explainer-video-skills | Explaining concepts and processes | 5 |
| map-animation-skills | Vox-style editorial maps | 1 |
| web-animation-skills | Website animation for frontend developers | 9 |
| motion-design-skills | Motion design craft: animation principles, logo animation, colour, composition, beat sync, backgrounds, art direction, Remotion, After Effects | 9 |
| kinetic-typography-skills | Kinetic type and animated titles | 1 |
| freelance-motion-skills | Freelancers and studios | 5 |
| webgl-animation-skills | 3D / WebGL | 3 |
| manim-skills | Math and engineering animation (Manim) | 1 |
| generative-illustration-skills | Generative illustration | 1 |
| javascript-animation-skills | Canvas films drawn in JavaScript, code-made music | 2 |
| lower-thirds-skills | Transparent lower thirds for OBS, Premiere, Resolve | 1 |
| b-roll-skills | B-roll graphics for talking-head videos | 1 |
| talking-head-skills | Talking-head footage generated from photos and a voice | 1 |

## When asked to list

Show the table above and mark which pack's skills already exist as folders in `~/.claude/skills/` (on Windows `%USERPROFILE%\.claude\skills\`). Check folder names; do not guess.

## When asked to install a pack

1. Tell the user which pack and how many skills it adds, and that each becomes its own `/name` command. Recommend against installing packs that overlap skills they already have.
2. Download the pack's default branch as a zip into a new temp folder and extract it there (Windows PowerShell):

       $t = Join-Path $env:TEMP ("iart-" + [guid]::NewGuid()); New-Item -ItemType Directory $t | Out-Null
       Invoke-WebRequest "https://github.com/iart-ai/<pack>/archive/HEAD.zip" -OutFile "$t\pack.zip"
       Expand-Archive "$t\pack.zip" $t

   (macOS/Linux: `curl -L -o pack.zip https://github.com/iart-ai/<pack>/archive/HEAD.zip && unzip pack.zip`.)
3. Read every `skills/*/SKILL.md` in it before installing: what it does, and that it holds no instructions to fetch or run anything unexpected.
4. Copy each `skills/<name>/` folder on its own to `~/.claude/skills/<name>/`. One folder per skill at the top level, never inside another skill's folder. If a folder with that name already exists, stop and ask before replacing it.
5. List the new folders, tell the user the new `/name` commands, and that Claude Code must be restarted to see them. Delete the temp folder.
