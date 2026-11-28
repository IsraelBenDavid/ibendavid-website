# StereoGraft project page

Served at `https://www.ibendavid.com/stereograft/` from this folder (GitHub Pages, repo `ibendavid-website`).
Plain HTML, CSS and JavaScript: no build step, no frameworks, and every URL is relative. The only external request is
Google Fonts Inter, as on the APEX page this design follows.

## Preview locally

```bash
cd ibendavid-website            # the repo root, not this folder
python3 -m http.server 8000
# open http://localhost:8000/stereograft/
```

Opening `index.html` as a file mostly works, but the interactive figures load JSON with `fetch`, which browsers block on
`file://`. Use the server.

## What to fill in

Everything an author edits is in the `window.SG_CONFIG` block at the top of `index.html`:

| key | what it is |
|---|---|
| `draft` | `true` shows every empty field as a dashed placeholder and prints the expected filename inside each empty video slot. Set it to `false` before publishing. |
| `authors` | `{ name, url, affil: [1, 2], mark: "*" }` per author. |
| `affiliations`, `authorNotes` | affiliation names (index 0 is affiliation 1) and an optional note such as "* Equal contribution". |
| `venue` | the venue / date line. It stays hidden when empty and `draft` is `false`. |
| `links` | `paper`, `arxiv`, `code`. An empty URL shows the button disabled. |
| `bibtex` | the BibTeX entry. The Copy button copies it. |
| `acknowledgements` | one paragraph. The section is hidden when empty and `draft` is `false`. |
| `teaser`, `t2s`, `v2s` | the video slots (see below). Add, remove or reorder entries freely. |

Before publishing, also fill in and uncomment the two commented `<head>` blocks: the 1200x630 social card
(`static/images/social-card.jpg`) and the Google Scholar `citation_*` tags.

## Videos

Every slot plays an anaglyph file and a side-by-side file. The page switches between them, keeping the playback time.
Videos load only near the viewport, play only while visible, and open in a full-window viewer on click. A slot stays a
grey placeholder until its file exists, so the files can be added one at a time.

Naming: `media/<section>/<id>_anaglyph.mp4` and `media/<section>/<id>_sbs.mp4`. Optional posters, shown before the
video loads, are `<id>_anaglyph.jpg` and `<id>_sbs.jpg` (`posterExt` in the config switches the extension to `webp`).
An entry may instead give explicit paths: `files: { a: "...", s: "...", pa: "...", ps: "..." }`.

| section | ids in the current config | files |
|---|---|---|
| teaser | `teaser` | `media/teaser/teaser_anaglyph.mp4`, `media/teaser/teaser_sbs.mp4` |
| text-to-stereo | `wan21_720p_1..4`, `wan21_1080p_1..4`, `ltx23_720p_1..4`, `ltx23_1080p_1..4` | `media/t2s/<id>_anaglyph.mp4`, `media/t2s/<id>_sbs.mp4` |
| video-to-stereo | `wan21_1..4`, `ltx23_1..4` | `media/v2s/<id>_anaglyph.mp4`, `media/v2s/<id>_sbs.mp4` |

For example, the first Wan 2.1 720p text-to-stereo slot is `media/t2s/wan21_720p_1_anaglyph.mp4` plus
`media/t2s/wan21_720p_1_sbs.mp4`. Each `t2s` entry also takes its `prompt`, and each `v2s` entry its `source`
(shown as the caption). The text-to-stereo gallery has a backbone picker (`backbone`: `wan21` or `ltx23`) and a
resolution picker (`res`), built from the values present in the config. A picker with a single value is hidden.
`ar` is the width / height of one view. It only sizes the empty placeholder, since the real ratio is read from the file.

Conventions:
- Anaglyph: red channel = left view, green and blue = right view.
- Side by side: left view in the left half, right view in the right half, at the same height.
- Video-to-stereo: the input video is the left view.

Encoding:
- H.264, yuv420p, `+faststart`, no audio, CRF about 23 to 26.
- The anaglyph at most 1280 px wide, the side-by-side at 2 x 960 or 2 x 1280.
- GitHub rejects files over 100 MB and warns above 50 MB. Keep the whole site well under 1 GB.

```bash
# anaglyph from left.mp4 + right.mp4 (R from the left view, G and B from the right view)
ffmpeg -i left.mp4 -i right.mp4 -filter_complex \
  "[0:v]format=rgb24,extractplanes=r[lr];[1:v]format=rgb24,extractplanes=g+b[rg][rb];[rg][rb][lr]mergeplanes=0x001020:gbrp,scale='min(1280,iw)':-2,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -crf 24 -preset slow -movflags +faststart -an ID_anaglyph.mp4
# side by side
ffmpeg -i left.mp4 -i right.mp4 -filter_complex \
  "[0:v]scale='min(960,iw)':-2[l];[1:v]scale='min(960,iw)':-2[r];[l][r]hstack=inputs=2,format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -crf 24 -preset slow -movflags +faststart -an ID_sbs.mp4
# posters (one frame, 2 s in)
ffmpeg -ss 2 -i ID_anaglyph.mp4 -frames:v 1 -q:v 3 ID_anaglyph.jpg
ffmpeg -ss 2 -i ID_sbs.mp4 -frames:v 1 -q:v 3 ID_sbs.jpg
```

## Comparison with prior methods

The "Against prior methods" section is one widget (`static/js/compare.js`): a baseline chosen by a pill row on the
left, StereoGraft on the right, the same example at the same disparity setting, played together. Its media are
ready-made and live in `media/compare/<example>/`:

```
<method>_d<setting>_anaglyph.mp4   <method>_d<setting>_sbs.mp4   (+ a .webp poster beside each)   thumb.webp
method:  dissolvestereo | dissolvestereo-dagger | svg | stereocrafter | stereograft      setting: 20 | 24 | 30
```

The examples, their captions and the one sentence shown per (example, baseline) are in `static/data/compare.json`.
To add an example, add its folder with all 30 videos and posters and one entry to that file. Nothing in this section
loads until it is near the viewport, and only the selected pair's two files are requested. "Right view" shows the
right half of the side-by-side file. The page-wide Anaglyph / Side by side switch also sets this section's view.

## Interactive figures

The page has three. All use real data from the paper's runs, precomputed into `static/images/` and `static/data/` by
asset scripts kept with the paper sources (not part of this site). Re-run those scripts to regenerate them.

| section | script | data |
|---|---|---|
| Key observation (depth settles early) | `static/js/traj.js` | `images/traj/`, `data/traj.json` (the artist's-studio run: Wan 2.1, 50 steps; median Pearson correlation over 50 videos) |
| Method, text-to-stereo (step-by-step walkthrough) | `static/js/stepper.js` + `static/js/method.js` | `images/method/`, `data/method.json` (the penguin run of the overview figure: Wan 2.1, d_max 32 px, warps after steps 5/10/15/20, P = 1, frame 40; shifts, holes and padding cells of the whole latent frame at each warp) |
| Method, video-to-stereo (the same stepper) | `static/js/stepper.js` + `static/js/v2s.js` | `images/v2s/`, `data/v2s.json`, `media/method/` (one Wan 2.1 conversion of a Stereo4D test clip at the paper's setting: 100 steps, inversion to step 30, warps after steps 30/40/.../80, P = 1; decoded inverted states, the right view's predictions, one fixed shift and hole set) |

`stepper.js` is the shared figure: timeline canvas, numbered list, the two-pane stage, caption, transport, keyboard.
Each walkthrough file holds its step list, captions, phase drawings and timeline. Frames load per step, and the
next step is preloaded; the two clips of the video-to-stereo figure play only in its first and last steps.

Keyboard:
- Depth figure: the arrow keys move along the steps, and Page Up / Page Down jump by five.
- Method figures (when focused): left and right arrows change the step, space plays or pauses, Home and End jump.
- `A` and `S` switch every video to anaglyph or side by side.
- `Esc` closes the video viewer.

With reduced motion, every animation shows its end state and nothing plays on its own. Light is the default theme;
the moon button switches to dark, and the choice is remembered in the browser (`sg-theme`, like the view choice
`sg-view`).

## Notes

- Do not add files or folders whose names start with `_`: the repo has no `.nojekyll`, so GitHub Pages would drop them.
- The footer keeps the Academic Project Page Template attribution (CC BY-SA 4.0) and credits the APEX page design.
