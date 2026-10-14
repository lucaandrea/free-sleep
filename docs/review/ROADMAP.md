# Free Sleep — twelve next improvements

Research snapshot: 14 October 2026. Design foundation: `e05cd99`; completed implementation reviewed through `b7a56cb`.

These are proposals, not shipped features. Effort is relative engineering scope, not a deadline. Start with data-quality explanations (#9), model evaluation and budgeting (#3), then the evidence-linked morning brief (#1). Expand Health context (#2) after signed-device validation.

## Current foundation

The repository already contains the shared web/SwiftUI design system, base preview/control adapter, presence analytics, journal, optional AI adapters, bounded feedback-based comfort, one-time alarm change/skip/restore, matching Routines editors, episode/vitals browsing, native Health workflows, Home bridge and App Intents. These have local/source/simulator evidence. Physical Pod/base operation, signed integrations, provider quality and Replit deployment remain unverified. Journal, Coach and common Settings layouts still need alignment.

## Model recommendation

| Role | Candidate | Why |
| --- | --- | --- |
| Private default | Local calculations + deterministic summaries | Always available. Use Apple’s on-device model on eligible iPhones; a separately hosted local model is an option for the web. [Apple · Foundation Models framework](https://developer.apple.com/foundation-models-framework/) |
| First cloud candidate | GPT-6.1 Sol · gpt-6.1-sol | Keep the existing initial choice for a bounded coaching pilot. Validate factual grounding, abstention and cost before enabling recurring briefs. [OpenAI · GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) · [OpenAI · Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) |
| Daily challengers | Claude Sonnet 5.5 · Gemini 3.8 Flash | Compare clarity, latency and factual accuracy on the same evidence. Choose using measured app results, not general leaderboard rankings. [Anthropic · Current model catalog](https://platform.claude.com/docs/en/models/overview) · [Google · Gemini model catalog](https://ai.google.dev/gemini-api/docs/models) |
| Deeper review candidate | Gemini 4 Argon · gemini-4-argon | Evaluate only if simpler candidates miss the quality bar. A long context window alone does not justify sending more personal data. [Google · What’s new in Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/latest-model) |
| Optional voice | Gemini 3.8 Live · gemini-3.8-live | Use for an explicitly chosen spoken check-in. It is a separate audio feature and privacy decision from the text coach. [Google · Live API](https://ai.google.dev/gemini-api/docs/live-api) |
| Forecast experiment | Simple thermal baseline → TimesFM 2.5 challenger | Evaluate on a capable local host in shadow mode. The model predicts; the bounded controller decides whether a reviewed command is allowed. [Google Research · TimesFM releases and weight licenses](https://github.com/google-research/timesfm) |

## The twelve proposals at a glance

| ID | Proposed update | Phase | Effort |
| --- | --- | --- | --- |
| 1 | A morning brief with receipts | First | Medium |
| 2 | One timeline for Apple Health and your bed | First | Large |
| 3 | A quality and cost center for AI | First | Medium |
| 4 | A private coach that works offline | Next | Large |
| 5 | Personal experiments, one change at a time | Next | Large |
| 6 | Predictive comfort before bedtime | Later | Large |
| 7 | A 20-second spoken morning check-in | Next | Medium |
| 8 | Describe a routine; review the exact changes | Next | Large |
| 9 | Explain changes and detect bad data | First | Medium |
| 10 | A wind-down scene that fits your evening | Later | Large |
| 11 | Position profiles that remember comfort | Later | Large |
| 12 | An optional photo-assisted context journal | Later | Medium |

These are app-specific engineering recommendations, not clinical validation or measured provider rankings. Use the smallest candidate that passes an evidence-grounded evaluation. Keep the provider choice explicit and measure full token cost, including reasoning.

## Proposals

### 1. A morning brief with receipts

**Phase:** First · **Effort:** Medium · **Area:** Daily insight

Open the app to one useful observation, the nights behind it, and one optional next step.

> “Your bedtime was more consistent on 5 recorded nights. See the dates.”

**New work:** Coach currently answers an explicit request. Add a saved daily brief, delivery preference, and an evidence drawer that links each statement to source dates and computed metrics.

**AI approach:** Calculate facts locally, then ask the chosen language model to explain an allowlisted fact set in a typed response. Start with GPT-6.1 Sol and compare Sonnet 5.5 and Gemini 3.8 Flash. Render a deterministic brief if no cloud sharing is enabled.

**Dependencies:** A versioned evidence record, wake-date/timezone handling, freshness checks and opt-in delivery. Pod presence must remain distinct from measured sleep.

**Acceptance:** Every numerical statement resolves to a stored calculation; missing or sparse nights cause abstention; the same evidence opens on web and iOS. No model may invent a score or a sleep stage.

Research: [OpenAI · GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [OpenAI · Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Google Research · Anatomy of a personal health agent](https://www.research.google/blog/the-anatomy-of-a-personal-health-agent/)

### 2. One timeline for Apple Health and your bed

**Phase:** First · **Effort:** Large · **Area:** Connected context

See Watch sleep, Pod presence, temperature changes and morning feedback on one clearly sourced timeline.

> Tap a restless interval to see what was recorded, by which device, and what is missing.

**New work:** The native app already has personal-side Health sync and local comparison. Extend this to an aligned timeline with source filters and explicit overlap resolution; add an opt-in derived-summary path for web parity.

**AI approach:** Keep alignment and statistics deterministic. Offer an optional explanation of selected intervals, using only the aggregates the user chooses to share. Use wearable-model research as a future evaluation direction, not as a replacement for source provenance.

**Dependencies:** Signed-device HealthKit validation, per-type consent, a stable personal-side binding, timestamp normalization and clear handling of multiple sleep sources. Web cannot query HealthKit directly.

**Acceptance:** Duplicate sources never double-count time. Users can inspect origin, revoke sharing and remove synchronized summaries. A missing Health sample never becomes a fabricated zero or an inferred stage.

Research: [Apple · HealthKit](https://developer.apple.com/documentation/healthkit), [Google Research · SensorFM](https://research.google/blog/sensorfm-towards-a-general-intelligence-and-interface-for-wearable-health-data/)

### 3. A quality and cost center for AI

**Phase:** First · **Effort:** Medium · **Area:** Foundation

Choose a provider with visible evidence, a monthly budget and an understandable privacy setting.

> “Local only” or “Cloud summaries · chosen provider · usage this month.”

**New work:** Provider adapters and explicit sharing already exist. Add a repeatable evaluation set, model/version history, usage accounting, a hard request budget and a user-visible comparison of tested results.

**AI approach:** Benchmark Sol, Sonnet and Flash on identical de-identified or synthetic cases. Include Gemini 4 Argon as a deeper-reasoning challenger. Test factual grounding, numbers, missing data, misleading notes, response time and total billed tokens. A second model may flag issues but cannot define the ground truth. For the native coach, use Apple’s new Evaluations framework with the same evidence fixtures and measured criteria.

**Dependencies:** Provider keys for live evaluation, expected answers from deterministic calculations, per-provider retention settings and a budget ledger. Cloud data never silently switches to another vendor.

**Acceptance:** All critical fixtures pass with zero fabricated measurements or device commands. The budget blocks further paid calls at its configured ceiling. Publish measured quality/cost results before changing the default.

Research: [OpenAI · GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Anthropic · Current model catalog](https://platform.claude.com/docs/en/models/overview), [Google · Gemini model catalog](https://ai.google.dev/gemini-api/docs/models), [Google · What’s new in Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/latest-model), [Apple · Meet the Evaluations framework, WWDC26](https://developer.apple.com/videos/play/wwdc2026/298/)

### 4. A private coach that works offline

**Phase:** Next · **Effort:** Large · **Area:** Privacy

Ask about your recent pattern on your iPhone without sending your night to a cloud provider.

> “What changed this week?” answered from local, cited facts even without Wi-Fi.

**New work:** The server supports a separately installed Ollama model. Add an on-device iOS coach and an editable, deletable memory of user-approved preferences. Keep the same brief and evidence layout on the web.

**AI approach:** Use Apple Foundation Models where available, with guided output and a small local evidence index. Use deterministic summaries on unsupported iPhones; a capable Mac/PC can serve the optional local web model. Do not put a large language model on the Pod.

**Dependencies:** OS/device availability checks, a local evaluation suite, explicit memory controls and shared output contracts. Cloud escalation requires a user choice.

**Acceptance:** Airplane-mode tests produce grounded answers on eligible devices; older supported iOS versions render useful fallback summaries. Deleting a memory removes it from subsequent prompts.

Research: [Apple · Foundation Models framework](https://developer.apple.com/foundation-models-framework/), [Apple · What’s new in Foundation Models, WWDC26](https://developer.apple.com/videos/play/wwdc2026/241/)

### 5. Personal experiments, one change at a time

**Phase:** Next · **Effort:** Large · **Area:** Learning

Turn “I think cooler helps” into a small, optional experiment with a clear result and honest uncertainty.

> Compare your usual setting with a user-selected 1°F change over balanced nights, then review comfort ratings.

**New work:** The journal already shows habit associations and adaptive comfort learns a bounded offset. Add a guided experiment planner, baseline period, adherence tracking and a review screen.

**AI approach:** Let the model explain a predefined protocol. Assign conditions and calculate differences locally, accounting for missed nights and obvious confounders. Use perceived comfort as the primary outcome until other measures are validated.

**Dependencies:** Enough baseline observations, repeat check-ins, user-chosen boundaries, a pause control and qualification of any scheduled temperature changes on real hardware.

**Acceptance:** Only one variable changes per protocol; incomplete data yields an inconclusive result; every change remains reversible. Observational habit patterns are never presented as proof of causation.

Research: [Google Research · Anatomy of a personal health agent](https://www.research.google/blog/the-anatomy-of-a-personal-health-agent/), [OpenAI · Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

### 6. Predictive comfort before bedtime

**Phase:** Later · **Effort:** Large · **Area:** Comfort

Have the bed approach your chosen temperature at bedtime using its measured heating and cooling behavior.

> “Start preparation at 9:12 to target 9:30” with a visible forecast and uncertainty range.

**New work:** Current adaptive comfort adjusts from morning feedback with strict limits. Add a thermal-response forecast, optional room context and a shadow mode that records predictions without controlling the bed.

**AI approach:** Start with a simple per-side thermal model. Evaluate TimesFM 2.5 as an offline challenger on a capable local host. A deterministic controller applies validated limits; the LLM only explains the plan. TimesFM 3 self-hosted weights are not a production option under their current license.

**Dependencies:** Real target/actual temperature history, room-temperature data if available, power/presence context and overnight hardware qualification. Performance must be evaluated on held-out nights.

**Acceptance:** Forecast error improves on a simple baseline before activation. Shadow mode, stale-data rejection, manual override, away/alarm guards and rollback all pass physical-device tests.

Research: [Google Research · TimesFM releases and weight licenses](https://github.com/google-research/timesfm)

### 7. A 20-second spoken morning check-in

**Phase:** Next · **Effort:** Medium · **Area:** Low-friction input

Hold a button, say how the night felt, and review a short check-in before saving it.

> “Too warm around three; felt okay this morning” becomes editable comfort and restfulness fields.

**New work:** Replace repetitive form entry with an optional voice path while keeping the existing accessible text form.

**AI approach:** Try local dictation first. Offer Gemini 3.8 Live for an explicitly selected conversational mode. Convert speech into typed fields, preserve uncertainty, and require the user to confirm the result.

**Dependencies:** Microphone permission, a visible recording indicator, explicit cloud-audio choice and a clear retention setting. Avoid capturing a sleeping partner with always-on listening.

**Acceptance:** Ambiguous times or negations require correction instead of silent guesses. Cancel discards unsaved audio/transcript data; saving never triggers a device action.

Research: [Google · Live API](https://ai.google.dev/gemini-api/docs/live-api), [Google · Gemini model catalog](https://ai.google.dev/gemini-api/docs/models), [OpenAI · Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

### 8. Describe a routine; review the exact changes

**Phase:** Next · **Effort:** Large · **Area:** Routines & Shortcuts

Build a schedule in natural language and inspect every affected day, side and setting before applying it.

> “On weekdays, warm my side at 9:30 and turn it off at 7” becomes a visible schedule diff.

**New work:** The app now has matching web/iOS Routines editors, per-day drafts, copy-days controls and stale-edit checks. Add a natural-language composer that drafts the same validated plan, plus a Shortcut entry point and an explicit before/after preview.

**AI approach:** Constrain the model to a schedule schema. Resolve dates and daylight-saving transitions in application code. Apply only a user-confirmed plan through existing authenticated services; keep model tools read-only.

**Dependencies:** Build on the locally validated Routines milestone 6c37306 and one-time alarm milestone f5e2b51. Add a versioned generated-plan contract, cross-day overlap checks, undo, and resolution of ambiguous days, sides and overnight intervals. Keep hardware qualification separate from draft generation.

**Acceptance:** A DST/timezone fixture suite passes. The preview shows all edits and any rejected request. No base movement, schedule write or temperature command occurs during generation.

Research: [OpenAI · Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Apple · App Intents](https://developer.apple.com/documentation/appintents)

### 9. Explain changes and detect bad data

**Phase:** First · **Effort:** Medium · **Area:** Trustworthy analytics

Distinguish a real shift in your routine from a missing night, an offline sensor or a changed data source.

> “This week has only two recorded nights, so a trend would be misleading.”

**New work:** Episode details already split charts at absence, invalid readings and long gaps, while retaining original values. Add completeness history, device/source freshness, comparisons that control for recorded-night count, and a “Why did this change?” drawer linked to those original readings.

**AI approach:** Use deterministic checks and robust personal baselines for quality signals. Give the model read-only, typed access to calculations and source metadata, so explanations point to exact evidence rather than making arithmetic up.

**Dependencies:** Ingestion timestamps, device/source identifiers, missingness flags and a baseline policy. General wearable foundation models require separate Pod-specific evaluation before any use.

**Acceptance:** Injected outages, clock shifts and duplicate records are identified without becoming health alerts. No diagnosis, apnea detector, readiness score or sleep stage is inferred from presence alone.

Research: [Google Research · SensorFM](https://research.google/blog/sensorfm-towards-a-general-intelligence-and-interface-for-wearable-health-data/), [Google Research · Anatomy of a personal health agent](https://www.research.google/blog/the-anatomy-of-a-personal-health-agent/)

### 10. A wind-down scene that fits your evening

**Phase:** Later · **Effort:** Large · **Area:** Apple Home

Connect a chosen bedtime routine with selected lights and bedroom settings, with a clear preview of what will happen.

> “Wind down” proposes the user’s selected lamp scene and bed preparation time.

**New work:** The LAN Home bridge foundation already exists. Add scene selection, a readable automation plan, quiet-hour preferences and execution history in the app.

**AI approach:** The model drafts a plan from a narrow inventory of user-approved actions. Home and the local scheduler execute fixed, reviewed rules. Remote availability is shown separately from local readiness.

**Dependencies:** Real Home pairing, a supported home hub where required, accessory availability, explicit scene selection and shared-household preferences.

**Acceptance:** Unavailable accessories are reported correctly; duplicate requests do not repeat an action; cancelling the routine stops pending actions. Base movement is excluded from unattended scenes.

Research: [Apple · Apple Home](https://developer.apple.com/apple-home/), [OpenAI · Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

### 11. Position profiles that remember comfort

**Phase:** Later · **Effort:** Large · **Area:** Pod Ultra base

Save your preferred reading or resting position and compare how comfortable it felt over time.

> “Your saved reading position: head 24°, feet 10°” with preview, explicit Move and persistent Stop.

**New work:** Head/feet sliders, presets and a reported-position view already exist. Add user-named profiles, feedback history and optional recommendations based on the positions the user has actually tried.

**AI approach:** Use a small transparent ranking model for preference learning; use an LLM only to explain the evidence. Recommendations are drafts. Whole-bed movement remains a deliberate physical action.

**Dependencies:** Verify BLE telemetry, limits, calibration, motion and Stop on the owner’s stock Pod/base first. Account for partner presence and shared-bed preferences.

**Acceptance:** Reported position stays separate from requested position. Stale telemetry blocks movement; Stop cancels pending movement. The product makes no snoring, apnea or therapeutic claims.

Research: [OpenAI · Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

### 12. An optional photo-assisted context journal

**Phase:** Later · **Effort:** Medium · **Area:** Multimodal input

Reduce logging effort by extracting visible text from a caffeine label or travel itinerary, then letting you correct it.

> A label photo suggests a product name and printed caffeine amount; the user supplies portion and time.

**New work:** The journal currently uses checkboxes and text. Add a small attachment flow with highlighted evidence, confidence and editable fields, linked to the night it may help explain.

**AI approach:** Prefer on-device OCR/image understanding where available; evaluate a selected multimodal cloud model only with consent. Treat text in images as data, never instructions. Do not infer consumed dose, meal calories or medical implications from appearance.

**Dependencies:** Image privacy controls, attachment deletion, time/portion confirmation, and a richer journal schema shared by web and iOS.

**Acceptance:** Every extracted fact highlights its source text. Unreadable fields stay empty. Cloud sharing and photo retention are optional, and extracted context cannot directly change the bed.

Research: [Apple · Foundation Models framework](https://developer.apple.com/foundation-models-framework/), [Google · Gemini model catalog](https://ai.google.dev/gemini-api/docs/models)

## What is new in the research

Apple’s WWDC26 Foundation Models additions include on-device image understanding and local search, which could support the private coach and photo journal. Its Evaluations framework integrates with Swift Testing to measure regressions. [Foundation Models additions](https://developer.apple.com/videos/play/wwdc2026/241/), [Evaluations](https://developer.apple.com/videos/play/wwdc2026/298/). Gemini’s current catalog separates reasoning, responsive text and live voice models. OpenAI Sol and Anthropic Sonnet are additional candidates for the bounded cloud coach; no live comparison has been performed here. [Gemini catalog](https://ai.google.dev/gemini-api/docs/models), [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Claude catalog](https://platform.claude.com/docs/en/models/overview).

SensorFM is a wearable-representation research direction, not a drop-in validated sleep-staging feature. [Google Research](https://research.google/blog/sensorfm-towards-a-general-intelligence-and-interface-for-wearable-health-data/). TimesFM 3 is newer, but its downloaded weights are restricted to non-commercial, non-production use; weights through 2.5 remain Apache-2.0. Evaluate the latter or a simple thermal baseline for a local production path. Authorized cloud use of 3 has different terms. [TimesFM license notice](https://github.com/google-research/timesfm). Apple Private Cloud Compute access also has eligibility conditions to check before relying on it. [Apple framework overview](https://developer.apple.com/foundation-models-framework/).

Cost illustration: Sol’s listed standard $2 input / $10 output per million tokens makes 4,000 input + 800 total billed output tokens $0.016 per call, or $0.48 for 30. Extra reasoning beyond this allowance, retries, tools, voice, hosting and hardware are excluded. This is illustrative arithmetic, not a measured bill or equivalence to Eight Sleep’s subscription. [Listed Sol rates](https://developers.openai.com/api/docs/models/gpt-6.1-sol).

## Release prerequisites

- Align journal, Coach and common Settings forms and add native record editing/deletion. Routines and episode browsing are locally validated; compare equal data/state for the remaining screens.
- Verify stock-Pod access/recovery, base telemetry/calibration/Stop, temperature control and overnight behavior.
- Test a signed iPhone’s Health authorization/sync and Shortcuts; pair the real Home bridge.
- Deploy and verify the authenticated Replit gateway, reconnect and offline behavior.
- Establish evaluation fixtures and account/model access before recurring cloud features.

## Primary sources

- [OpenAI · GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) — Current model capabilities and standard token pricing. Candidate for concise cloud coaching; no sleep-specific evaluation has been run.
- [OpenAI · Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) — Schema-constrained output can shape a routine or brief. Application validation must still check every value and action.
- [Anthropic · Current model catalog](https://platform.claude.com/docs/en/models/overview) — Sonnet 5.5 is a balanced challenger; the catalog also includes Opus 5.5 and Fable 5.1. Bigger models are optional evaluation candidates, not automatic upgrades.
- [Google · Gemini model catalog](https://ai.google.dev/gemini-api/docs/models) — Lists Gemini 4 Argon, 3.8 Flash and 3.8 Live as stable. Different models serve reasoning, responsive summaries and spoken interaction.
- [Google · What’s new in Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/latest-model) — Current flagship supports tunable reasoning. Introductory pricing ends 30 November 2026; evaluate quality and full reasoning-token cost before adopting.
- [Google · Live API](https://ai.google.dev/gemini-api/docs/live-api) — Realtime audio makes an optional spoken check-in feasible. It adds microphone, connection and audio-retention decisions.
- [Apple · Foundation Models framework](https://developer.apple.com/foundation-models-framework/) — Native Swift APIs now cover on-device models, guided generation, image understanding and other model providers. Feature availability must be checked at runtime.
- [Apple · What’s new in Foundation Models, WWDC26](https://developer.apple.com/videos/play/wwdc2026/241/) — 2026 additions include vision, context management, semantic search and broader model integration. Our iOS 18 minimum requires a fallback path.
- [Google Research · SensorFM](https://research.google/blog/sensorfm-towards-a-general-intelligence-and-interface-for-wearable-health-data/) — 9 July 2026 research on general representations for wearable signals. A research direction, not a validated drop-in model for Pod sleep stages.
- [Google Research · TimesFM releases and weight licenses](https://github.com/google-research/timesfm) — August–September 2026 brought TimesFM 3 multivariate forecasting and cloud rollout. Self-hosted 3.0 weights are non-commercial/non-production; weights through 2.5 remain Apache-2.0. Authorized cloud production use has separate terms.
- [Google Research · Anatomy of a personal health agent](https://www.research.google/blog/the-anatomy-of-a-personal-health-agent/) — 30 September 2025 foundational research separates data analysis, domain context and coaching. Useful architecture guidance; not a clinical endorsement of this app.
- [Apple · HealthKit](https://developer.apple.com/documentation/healthkit) — Native, authorized access to personal health records. Data origin and the user’s selected bed side remain essential.
- [Apple · Apple Home](https://developer.apple.com/apple-home/) — Platform context for user-selected Home accessories and scenes. A LAN bridge and real pairing still need qualification.
- [Apple · App Intents](https://developer.apple.com/documentation/appintents) — Typed actions for Shortcuts and system surfaces. Discovery in a build is distinct from execution on a signed phone.
- [Apple · Meet the Evaluations framework, WWDC26](https://developer.apple.com/videos/play/wwdc2026/298/) — The new framework integrates datasets, quantitative metrics and model-judged criteria with Swift Testing. Use it to qualify the native coach across model and prompt changes; ground numerical truth in application calculations.

The standalone visual review is [free-sleep-before-after.html](free-sleep-before-after.html). Regenerate both documents with `python3 docs/review/build_review.py` from the repository root.
