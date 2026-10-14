# Free Sleep web, iPhone and Pod setup

This branch is a software implementation awaiting device qualification. The owner's Pod 4 Ultra still runs stock Eight Sleep software; their subscription has about ten days remaining as of 2026-10-13. Nothing in this work has installed software on, paired with, or moved that Pod. Subscription expiry alone does not install Free Sleep or establish access to its hardware.

Adaptive comfort is off by default. Its [configuration and qualification guide](ADAPTIVE_COMFORT.md) describes preview mode, feedback learning, temperature limits, manual pauses and the required presence heartbeat. Update the Python biometrics service alongside the server before evaluating this feature.

## Before migrating the stock Pod

1. Preserve the current working setup while recording firmware versions, bed model, existing schedules, temperature preferences, and base presets. Request/export any existing sleep history through Eight Sleep's supported account process while access remains. This implementation has no Eight Sleep account importer and does not promise access to subscription history after cancellation.
2. Read this repository's Pod 4 installation and recovery instructions, including its hardware/SSH access requirements. Establish a restorable stock backup before changing services or firmware. In particular preserve `/persistent/AdjustableBaseConfiguration.json`, BlueZ pairing state (normally `/var/lib/bluetooth`), and other persistent configuration. Keep these backups private. Do not run an installer intended for a different firmware generation.
3. Check that a usable BlueZ daemon and system D-Bus exist and that the Free Sleep service user can access the configured base. The new adapter does not create Bluetooth pairings, scan arbitrary devices, or replace the stock base configuration.
4. Qualify temperature and presence collection locally first. Then connect the base read-only and compare reported positions with the physical bed. Follow the small-movement/Stop checklist in [base research](research/base-control.md). Keep the stock controller available during attended tests.
5. Enable remote access and Apple Home only after those local checks. Cloud connectivity and an iOS build cannot validate motor calibration or a physical stop.

No automated migration, firmware reset, subscription bypass, or stock-service removal is included in this change. The remaining subscription time is a migration window, not proof this branch is ready to replace the stock system unattended.

## Build and local development

Use Node 24.11 or newer. From the repository root:

```sh
npm --prefix server ci
cd server
npx prisma generate
npx tsc
npm run sentry:inject
npm test
npm run lint
cd ../app
npm ci
npx tsc -b
npm run lint
npm run build:hosted
```

`build:hosted` creates the web bundle in `server/public` without uploading source maps. The repo tracks compiled server and web output; regenerate both with source changes. Server start still needs its existing `DATA_FOLDER` (with trailing slash), `ENV`, and database configuration. Use `npm run dev:local` for the existing local development setup; it cannot control a real Pod without its socket.

For a clearly labelled browser demo: `cd app && npm run demo` (see `package.json` if using the Vite CLI directly). Demo handlers simulate controls and records; they do not reach hardware. To develop against a locally reachable, configured Pod: `VITE_POD_IP=<address> npm run dev`.

## Pod feature configuration

Use `server/.env.features.example` as a template for **additional environment variables**. The template is not loaded automatically. Preserve the existing `.env.pod` settings. On a qualified installation, supply the new values through the service environment or an additional private `EnvironmentFile`; keep secrets out of Git. Rebuild/restart the Free Sleep service after configuration changes.

- `FREE_SLEEP_API_TOKEN`: a random secret required by web/iOS requests. Legacy LAN installs without this variable retain their existing API behavior; never expose that API directly to the Internet. Narrow loopback endpoints remain available to existing biometric/root helpers.
- `BASE_CONFIG_PATH`: defaults to `/persistent/AdjustableBaseConfiguration.json`. The file must contain the stock `Address` and `SplitBase` fields. Click **Connect base** after starting the server. Movement requires recent real telemetry; previews do not move the bed. Both sides move together.
- `HOMEKIT_ENABLED=true`: opt in to the local bridge. TCP port defaults to `51826`; mDNS must work on the home network. The bridge identity and pairing survive in `DATA_FOLDER/homekit`. Back up that directory and never reset it as part of an upgrade. A corrupt identity produces an error rather than silently forcing re-pairing.
- Provider keys and model IDs: configure only the providers you want. OpenAI is the initial cloud recommendation; deterministic insights remain the default until you explicitly choose and authorize a model. Ollama belongs on a capable computer, not the embedded Pod. Set `OLLAMA_BASE_URL` to its reachable endpoint and install the selected model separately.

The coach sends numerical analytics, numerical journal patterns, and the question you type only after consent for that request. Journal notes and HealthKit samples are excluded. Models have no hardware tools. Cloud providers have not been called with the owner's credentials during this implementation.

## Replit hosting

Use a **Reserved VM**, one instance, for the persistent Pod WebSocket. `.replit` builds the web UI and starts `gateway/server.mjs`; do not run the embedded Pod server in Replit. This follows [Replit's deployment types](https://docs.replit.com/features/publishing/deployment-types).

```mermaid
flowchart LR
  Browser[Web browser] -->|HTTPS + access token| Gateway[Replit gateway]
  iPhone[Native iPhone app] -->|HTTPS + access token| Gateway
  Agent[Agent on Pod] -->|Outbound WSS + tunnel token| Gateway
  Agent -->|Loopback + local API token| Pod[Free Sleep API]
  Pod --> DAC[Temperature socket]
  Pod --> BLE[Bluetooth base]
```

1. Import this branch into the intended Replit project. Set two distinct secrets, each at least 32 random characters: `GATEWAY_ACCESS_TOKEN` and `POD_TUNNEL_TOKEN`. Generate each separately with `openssl rand -hex 32` and store them privately.
2. Deploy using the checked-in Reserved VM configuration. The unauthenticated `/healthz` reports gateway health only; it does not imply a connected Pod.
3. On the already-qualified Pod, install `gateway` dependencies with `npm ci --omit=dev`. Create `/persistent/free-sleep-data/tunnel.env` privately, containing `GATEWAY_URL=wss://<published-host>/tunnel`, `POD_TUNNEL_TOKEN`, and the Pod's `FREE_SLEEP_API_TOKEN`. Its local API is fixed to loopback; no router port forwarding is required.
4. Review and install `gateway/free-sleep-tunnel.service` with paths/user adjusted to the actual installation. This is a supplied service definition, not a service installed by this work. Enable it only when the local Pod is ready.
5. In web Settings, leave the address empty for the current hosted origin and enter the **gateway access token**, which stays in that tab's session storage. In iOS Settings enter the HTTPS published origin and the same access token; iOS stores it in Keychain. Model keys and the tunnel secret never go in either client.
6. Verify an unauthenticated API request returns 401, an offline Pod returns 503, and a permitted read works through the agent. Then test an attended command, disconnect during a request, and reconnect. In-flight commands fail and are not replayed automatically. Always inspect the bed before retrying an uncertain command.

The gateway forwards app operations through a fixed allowlist and bounded requests. Raw command execution, root maintenance jobs and log streaming stay LAN-only. It holds no sleep database, but authorized API data transits Replit. The hosted UI cannot call a private HTTP Pod directly from HTTPS; use the gateway or the local app.

No Replit project has been created, published, or connected to the owner's Pod. The Git remote currently points at upstream `throwaway31265/free-sleep`; choose the user's destination before pushing or publishing.

## Native iOS

`ios/FreeSleep.xcodeproj` is a native SwiftUI project, generated from `ios/project.yml` using XcodeGen. Minimum iOS is 18; validation used the available iOS 27 simulator. No web view is used. Main screens share the web design; native system pickers and Apple permission sheets retain their platform behavior.

```sh
cd ios
xcodegen generate
xcodebuild -project FreeSleep.xcodeproj -scheme FreeSleep \
  -destination 'platform=iOS Simulator,name=Free Sleep QA' CODE_SIGNING_ALLOWED=NO test
```

For a device build, select the owner's signing team and a registered bundle ID and enable HealthKit and HomeKit capabilities. The current bundle ID is `com.lucaandrea.freesleep`. No signing team, provisioning profile, App Store Connect record or TestFlight build has been configured by this work. Use Safari when working in Apple's portals.

- **Health:** Choose the side that belongs to you, choose Health permissions, then sync. Presence becomes `inBed`; optional range-filtered heart rate keeps its Pod provenance. Repeat exports use stable IDs and update versions; obsolete exports are removed only from this app's matching Pod/side/date window after replacements save. Unvalidated Pod HRV/breathing and fabricated sleep stages are never exported. Apple Health sleep, heart rate, SDNN HRV and respiration comparisons stay on the iPhone. Read denial is intentionally indistinguishable from empty data in HealthKit. Sync is manual while the app is open; there is no guaranteed unattended background import.
- **Home:** Enable the local HAP bridge, connect the base in the app, and use the pairing code in Settings to add it to Apple Home. Thermostats expose both sides; named switches expose positions, Stop and priming. The bridge is not an Apple-certified accessory. Native Settings can also list and run the user's existing Home scenes after permission. Remote Apple Home automations require a supported home hub. Base actions need a connected, qualified base; the bridge does not silently reconnect and move after a restart.
- **Shortcuts/Siri:** Find Free Sleep actions for power, temperature, preset, head/feet angles, Stop and routine summary. They use the same saved authenticated connection and return errors offline. Discovery metadata was generated by Xcode; actual Siri execution and locked-device behavior require a signed device check. Returned text acknowledges a command, not proof of physical motion.

## What this does and does not replace

Available: temperature control, per-side weekly routines and vibration alarms, manual head/feet previews and commands, base presets/Stop, local presence/vital trends and quality notes, calendar-week comparisons, morning journal and habit associations, private deterministic coaching, opt-in cloud/local LLM coaching, HealthKit export/comparison, Home bridge and App Intents.

Not established: Eight Sleep's proprietary sleep staging, calibrated readiness scores, apnea/snoring classification, automatic anti-snoring base movement, or a learned closed-loop thermal Autopilot. The app makes no medical-equivalence claim. Sensor qualification and a separate evaluated control policy are needed before adding those features. The coach never changes the bed autonomously.
