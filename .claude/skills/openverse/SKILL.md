---
name: openverse
description: Find and download openly licensed media from Openverse (WordPress's search engine for Creative Commons and public-domain works) - background music, sound effects and images for videos - with the attribution saved for every file. Use when the user types /openverse, or asks for free or royalty-free music, sound effects, or images they are allowed to use in a video.
argument-hint: "[music|sound effect|image] [what you are looking for]"
---

# openverse

Openverse indexes hundreds of millions of openly licensed images and audio files. This skill searches its public API and downloads what the user picks. Script: `scripts/openverse.mjs` (Node 18+, no key, no dependencies).

## Steps

1. Work out the kind (`audio` or `images`) and a short English query (Openverse metadata is mostly English: translate "موسيقى هادئة تقنية" to "calm technology"). For music add `--category music`, for sound effects `--category sound_effect`.
2. For anything going on social media, search with `--commercial` (keeps only CC0, public domain, CC BY, CC BY-SA: commercial use and editing allowed). Say plainly that BY and BY-SA require a credit, and that NC or ND licenses are not suitable for a monetised or edited video.

       node <skill>/scripts/openverse.mjs search audio "calm technology" --category music --commercial --n 15 --out <project>/openverse-audio.json

3. Show the user the numbered list (title, creator, license, length or size, source page) and let them choose. You cannot listen to audio or judge an image you have not looked at: for images, download a few candidates and look at them before recommending; for audio, recommend by title, tags and length and say the user should listen.
4. Download the chosen numbers into the project, never over existing files:

       node <skill>/scripts/openverse.mjs get <project>/openverse-audio.json 3,7 --dir <project>/media

   Every file's attribution is appended to `<project>/media/CREDITS.md`. Tell the user to paste the credit lines for CC BY / BY-SA items into the post caption.
5. Report where the files are and their licenses. A music file can then be handed to the edit (for example: mix it under the voice at about -20 dB with ducking).

## Notes

- Anonymous API use is rate limited; on a 429 wait a minute and retry, do not loop.
- If a download fails, give the user the source page link instead.
- Licenses come from Openverse's metadata; for anything important, the source page is the final word.
