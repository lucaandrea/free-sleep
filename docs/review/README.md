# Free Sleep visual review

Open **free-sleep-before-after.html** in a browser. It is a self-contained document: CSS, JavaScript and screenshots are embedded, so the HTML can be copied by itself and opened offline. External links are primary research references and the three design-reference repositories. No API, account, analytics or model call is made by the document.

The review includes four detailed before/after comparisons, the desktop layout, shared design tokens, native iOS light/dark/base/accessibility captures, completed alarm/Routines/episode, common-form and device-settings galleries, remaining parity work and twelve researched proposals. Implementation status is reconciled through `189d54e`. Tabs support arrow/Home/End keys. Screenshots enlarge in a modal with Escape dismissal. Roadmap filters and expandable details work locally. Printing expands proposal details and includes all four screen comparisons; use full-capture inspection for screenshot content clipped by print frames.

## Edit and regenerate

```sh
python3 docs/review/build_review.py
```

- `build_review.py`: editorial comparison, HTML structure and model recommendations.
- `review.css`: responsive screen/print styling.
- `review.js`: progressive enhancement for tabs, image inspection, filters and print.
- `roadmap.json`: the twelve proposals and fifteen primary sources.
- `ROADMAP.md`: generated readable roadmap for repository review.
- `free-sleep-before-after.html`: generated, portable deliverable.

The builder uses Python’s standard library. No package installation or network is needed. Check generated files into Git with their sources.

## Screenshot provenance

| Capture | Origin | Evidence |
| --- | --- | --- |
| Before: temperature | `docs/on.PNG` | Existing repository archive; original capture date/build unknown |
| Before: metrics | `docs/metrics.PNG` | Same archive |
| Before: schedule | `docs/schedules.PNG` | Same archive |
| Before: settings | `docs/settings.PNG` | Same archive |
| Hero, current phone | `docs/screenshots/parity-web-phone.png` | Existing shared-design demo validation |
| `assets/current-*.jpg` | Web demo captured 2026-10-14 | Vite demo preview; reviewed app milestone `e05cd99`; synthetic state |
| `assets/native-tonight.png`, `native-dark.png`, `native-base.png`, `native-large-text.png` | Center 310×610 crops of `docs/screenshots/parity-ios-*.png` | Existing simulator-mirror captures; originals retained |
| Alarm gallery | `docs/screenshots/alarm-web-changed.jpg` and two native crops | Completed milestone `f5e2b51`; simulated one-time alarm flows |
| Routines comparison and gallery | `docs/screenshots/routines-web-phone.jpg`, `assets/native-routines-top.jpg`, `assets/native-routines-saved.jpg` | Completed milestone `6c37306`; matching editors and simulated weekday save |
| Common-form gallery | `docs/screenshots/journal-web-phone.jpg`, `assets/native-journal.jpg`, `assets/native-coach.jpg` | Completed milestone `4a16125`; synthetic check-ins and deterministic coaching |
| Device gallery | `docs/screenshots/preferences-web-saved.jpg`, `assets/native-preferences-saved.jpg`, `assets/native-health.jpg` | Completed milestone `189d54e`; simulated preference save and reported sample status |
| Episode gallery | `docs/screenshots/episodes-web-phone.jpg`, `episodes-web-vitals.jpg`, `assets/native-episodes-detail.jpg` | Completed milestone `b7a56cb`; shared synthetic episodes and vital readings |

The browser screenshot API returned JPEG bytes even for a requested `.png` filename; current captures use corrected `.jpg` extensions. Full-page web images show fixed navigation at the capture viewport’s vertical position. Frames may crop or scroll an image but do not redraw the UI. Different archived/demo data is not an outcome comparison. Original `e05cd99` captures remain intact; the Routines comparison uses its newer completed capture. Alarm native crops come from `alarm-ios-changed.jpg` and `alarm-ios-editor.jpg`. Routines and episode native crops come from `routines-ios-top.jpg`, `routines-ios-saved.jpg` and `episodes-ios-detail.jpg`. Those five use pixel rectangle `(502, 70, 779, 632)` from the full 1187×720 simulator-mirror images retained in `docs/screenshots/`. The episode web and native images show the same synthetic night at different scroll positions. The new journal and Coach crops use the same rectangle from their 1187×720 mirror originals. Device-preference and health crops use rectangle `(506, 70, 777, 632)` from their 1280×720 originals; full mirrors remain in `docs/screenshots/`.

Current captures were obtained from `app/dist` with:

```sh
cd app
VITE_ENV=demo node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5174 --strictPort
```

The demo was labeled and isolated from external transport. Generating its sample Coach answer did not call a cloud provider. No physical Pod operation, account setup, signed Health permission, Home pairing or deployment was performed for this document. See `docs/VALIDATION.md` and `docs/DESIGN_PARITY.md` for the underlying implementation’s validation boundaries.

## Research method

Primary vendor documentation and Google Research publications were checked on 2026-10-14. This refresh rechecked the OpenAI, Anthropic and Gemini catalogs, Apple Foundation Models and Evaluations, SensorFM and TimesFM. It verified the current Sol pricing illustration and the non-production restriction on downloaded TimesFM 3 weights. The roadmap distinguishes newly available capabilities from older architectural research and from our own product proposals. Routine composition and data-quality proposals now build on the completed editor and episode browser. Model names/pricing/licensing can change. The recommendation is to evaluate candidates on the app’s actual task; no live model ranking or clinical claim is implied.

## Document validation — 2026-10-14

- HTML inspection: 31 embedded images, 12 proposals, 15 sources; unique IDs, valid local anchors and no external runtime assets. All embedded image payloads decode and validate. The portable file is approximately 3.07 MiB.
- Python source parses and the builder runs. JavaScript syntax passes `node --check`.
- Current local HTTP preview renders at the default desktop viewport without horizontal document overflow or browser console errors. Earlier review validation covered a 390×844 phone override; this refresh did not repeat the narrow-viewport check. Wide comparison tables retain their own scroll containers. The proposal overview now uses the same readable table styling; section links jump immediately through the long document.
- This refresh opened the new native preference capture, verified its save confirmation, dismissed the modal with Escape, filtered to the four First proposals and restored all twelve. Expand/collapse toggled all twelve detail panels. Earlier validation covered all four comparison panels, keyboard tab navigation, episode-image inspection and the Later filter.
- `preview.jpg` records the refreshed document at the default desktop viewport. The review tab was left open for the user.
- Print styles and automatic expansion are provided; a rendered PDF/print job was not validated.
- Direct `file://` navigation is blocked by the embedded browser’s URL policy. Offline portability was checked structurally, not by a direct-file browser run. Open the HTML in a normal browser to use that path.

This document refresh does not add app-runtime behavior. The accompanying device-preferences milestone passed 96 server, 50 native, six web and six gateway tests, plus demo UI checks, recorded separately in `docs/VALIDATION.md`.
