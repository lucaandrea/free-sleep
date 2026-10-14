# Analytics, AI and Apple integration research

Reviewed 2026-10-13. Model catalogs change; IDs are configurable and availability must be checked using the user's API account. No API keys have been supplied to this project and no provider has been benchmarked on the user's data.

## Analytics contract

[Eight Sleep Autopilot](https://www.eightsleep.com/autopilot/) combines temperature adjustment, sleep/health analysis and coaching. Its proprietary staging, snoring and health models cannot be reconstructed from this repo's presence records. Free Sleep's own README only describes heart-rate validation; HRV and respiratory estimates remain experimental.

Calculate observed bed-presence duration, occupancy, bed exits, timing variation, recent changes, a user-selected opportunity goal, and vitals trends locally. Retain missing values as unknown. Never label presence as REM, deep sleep, total sleep time, clinical sleep efficiency, readiness or an apnea result. Keep algorithmic automation independent of LLM prose and do not grant models device tools.

## Model selection

| Provider | Initial model | Use |
| --- | --- | --- |
| OpenAI | `gpt-6.1-sol` | Initial cloud coach; balance of capability and cost |
| Google | `gemini-3.8-flash` | Alternative for responsive summaries |
| Anthropic | `claude-sonnet-5-5` | Alternative for explanatory coaching |
| Ollama | `qwen3:8b` (operator-installed) | Optional local model on a capable Mac/PC |
| Local rules | No model | Default, private, reproducible observations |

Sources: [OpenAI models](https://developers.openai.com/api/docs/models), [Gemini models](https://ai.google.dev/gemini-api/docs/models), [Claude models](https://platform.claude.com/docs/en/models/overview), [Ollama chat API](https://docs.ollama.com/api/chat). This is an engineering choice, not a claim that any model is clinically validated for sleep. An evaluation should score factual grounding, correct abstention with missing data, numerical accuracy, latency and cost before changing defaults. Large models should not run on the Pod.

Coaching is opt-in. Only numerical aggregates (including habit patterns) and the typed question leave the Pod when requested. No fallback silently sends data to a different provider. Keys live in the server environment. Output is schema-checked, requests are bounded, and model errors are visible. HealthKit records are not automatically passed to models.

## Apple Health

[HealthKit](https://developer.apple.com/documentation/healthkit) is native and requires a signed entitlement and user authorization per data type. Browsers cannot directly use it. Read authorization cannot be inferred from an empty query. Use [sync identifiers](https://developer.apple.com/documentation/healthkit/hkmetadatakeysyncidentifier) and versions to avoid duplicate exports. Export Pod presence as `inBed`, never as asleep or a fabricated sleep stage. Do not export unvalidated Pod HRV under HealthKit's SDNN type: metric equivalence has not been established. Apple-derived sleep stages remain sourced to their originating device. Users must choose which bed side belongs to them.

## Apple Home

[Apple's Home framework](https://developer.apple.com/apple-home/) controls compatible accessories; importing HomeKit in an iOS app does not make the Pod an accessory. A LAN bridge using [HAP-NodeJS](https://github.com/homebridge/HAP-NodeJS) can publish per-side thermostats and explicit switches for supported actions. It must persist identity and pairing data. HAP-NodeJS is not an Apple-certified accessory implementation. Apple Home has no standard bed-angle service: presets are exposed as named switches. The bridge and Bluetooth controller remain at home; a Replit process cannot directly advertise on the user's LAN. Remote Apple Home automation requires the user's supported home hub.

## Shortcuts

[App Intents](https://developer.apple.com/documentation/appintents/creating-your-first-app-intent) expose concrete actions: temperature, power, base preset/position/stop and reading the latest summary. Share one authenticated API service with the native UI. Fail visibly offline; do not claim successful physical execution because a Shortcut was discovered by the system.
