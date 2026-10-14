# Free Sleep visual review

Open **free-sleep-before-after.html** in a browser. It is a self-contained document: CSS, JavaScript and screenshots are embedded, so the HTML can be copied by itself and opened offline. External links are primary research references and the three design-reference repositories. No API, account, analytics or model call is made by the document.

The review includes four detailed before/after comparisons, the desktop layout, shared design tokens, native iOS light/dark/base/accessibility captures, remaining parity work and twelve researched proposals. Tabs support arrow/Home/End keys. Screenshots enlarge in a modal with Escape dismissal. Roadmap filters and expandable details work locally. Printing expands proposal details and includes all four screen comparisons; use full-capture inspection for screenshot content clipped by print frames.

## Edit and regenerate

```sh
python3 docs/review/build_review.py
```

- `build_review.py`: editorial comparison, HTML structure and model recommendations.
- `review.css`: responsive screen/print styling.
- `review.js`: progressive enhancement for tabs, image inspection, filters and print.
- `roadmap.json`: the twelve proposals and fourteen primary sources.
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
| `assets/native-*.png` | Center 310×610 crops of `docs/screenshots/parity-ios-*.png` | Existing simulator-mirror captures; originals retained |

The browser screenshot API returned JPEG bytes even for a requested `.png` filename; current captures use corrected `.jpg` extensions. Full-page web images show fixed navigation at the capture viewport’s vertical position. Frames may crop or scroll an image but do not redraw the UI. Different archived/demo data is not an outcome comparison. The later uncommitted alarm work is outside this review.

Current captures were obtained from `app/dist` with:

```sh
cd app
VITE_ENV=demo node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5174 --strictPort
```

The demo was labeled and isolated from external transport. Generating its sample Coach answer did not call a cloud provider. No physical Pod operation, account setup, signed Health permission, Home pairing or deployment was performed for this document. See `docs/VALIDATION.md` and `docs/DESIGN_PARITY.md` for the underlying implementation’s validation boundaries.

## Research method

Primary vendor documentation and Google Research publications were checked on 2026-10-14. The roadmap distinguishes newly available capabilities from older architectural research and from our own product proposals. Model names/pricing/licensing can change. The recommendation is to evaluate the candidates on the app’s actual task; no live model ranking or clinical claim is implied.

## Document validation — 2026-10-14

- Standard-library HTML inspection: 16 embedded images, 12 proposals, 14 sources; unique IDs, valid local anchors and no external runtime assets. Embedded image payloads decode successfully.
- Python source parses and the builder runs. JavaScript syntax passes `node --check`.
- Local HTTP browser preview: default desktop viewport and a 390×844 phone override render without document-level horizontal overflow or browser console errors. Wide comparison tables scroll within their own container.
- All four comparison panels, arrow-key tab selection, full-capture modal/Escape dismissal, First/Later/All filters and expand/collapse controls were exercised. The original desktop viewport was restored.
- `preview.jpg` records the rendered document at the default desktop viewport. The review tab was left open for the user.
- Print styles and automatic expansion are provided; a rendered PDF/print job was not validated.
- Direct `file://` navigation is blocked by the embedded browser’s URL policy. Offline portability was checked structurally, not by a direct-file browser run. Open the HTML in a normal browser to use that path.

No application-runtime test suite was rerun for this documentation-only change. Earlier app validation remains recorded separately in `docs/VALIDATION.md`.
