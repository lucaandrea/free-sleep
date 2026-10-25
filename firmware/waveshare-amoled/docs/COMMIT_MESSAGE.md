# Title

feat: connect Waveshare remote without sample Preview data

# Description

Allow USB Wi-Fi setup before the Core controller is ready, preserving an existing origin/key. Leave sample Preview, show unavailable values and explicit connection states, and keep bed commands disabled until a controller is configured. Add redacted read-only USB status.

```mermaid
flowchart LR
  USB[Private USB setup] --> WiFi[Saved Wi-Fi]
  WiFi --> Ready[Waiting for Core origin and key]
  Ready --> Core[Authenticated Core]
  Core --> Controls[Live bed controls]
```

Validation: both host suites and 122 circular-screen captures pass. Firmware 0.4.1 is installed; USB status confirms Wi-Fi connected and Preview off across a restart. The final update preserved NVS byte for byte. Core origin/key provisioning and physical bed commands remain pending the coordinated controller deployment.
