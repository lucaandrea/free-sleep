# Windows home-host setup

The Lenovo owner verified Windows 10 Home, a ThinkPad T450s with an i5-5300U,
12 GB RAM and 93 GB free. Firmware virtualization was initially disabled; the
owner enabled it in BIOS and reported `VirtualizationFirmwareEnabled: True`.

RustDesk works manually but the Mac desktop-control tool cannot inspect it.
`Enable-LenovoSetup.ps1` provides a narrowly scoped command connection for the
remaining Home Assistant VM setup. It must be run by the owner in **Windows
PowerShell as administrator** on the Lenovo.

## Scope

- Install Microsoft's Windows OpenSSH Server optional feature if needed.
- Bind port 8823 only to the Lenovo's currently assigned Tailscale IPv4 address.
- Accept one supplied Mac Tailscale address and one Ed25519 public key.
- Disable password login, agent forwarding, TCP forwarding and X11 forwarding.
- Restrict authorized-key file permissions to SYSTEM and Administrators.
- Give the configured host private key Administrators ownership and SYSTEM/Administrators-only access. Keys generated from an elevated user shell otherwise retain user ownership, which the Windows service rejects.
- Refuse an existing SSH configuration not created by this script.
- Preserve Homebridge, Apple Home pairings and unrelated firewall rules.
- Use a manual service: setup access does not automatically restart with Windows.
- Validate the OpenSSH configuration before starting; leave the listener stopped
  if setup fails. The Windows feature and generated host keys remain installed.

No private key, password, device address or personalized launcher is stored here.
The installer is idempotent for its own configuration. `-WhatIf` performs the
prerequisite reads and describes the change without installing or enabling access.

```powershell
# Supply the actual Mac Tailscale IPv4 and the public half of a dedicated key.
.\Enable-LenovoSetup.ps1 -ClientAddress '<Mac Tailscale IPv4>' -PublicKey '<ssh-ed25519 public key>'

# After setup, revoke only this script's connection. Run locally on the Lenovo.
.\Enable-LenovoSetup.ps1 -Action Disable
```

The successful output includes `SETUP_SSH_READY`, the account/address/port and
the Ed25519 host-key fingerprint. Compare that fingerprint with the Mac's first
connection before recording a trusted host key. Do not use `StrictHostKeyChecking=no`.

Validation on the owner's Windows 10 Home host: optional-feature installation,
configuration parsing, scoped firewall rule, firmware virtualization, and a fresh
key-authenticated connection to the running Windows service all passed. The first
service start failed with exit 1067 because the generated host key was user-owned;
correcting that ownership allowed it to start. The initial diagnostic connection
was closed after separately verifying the service connection. PowerShell syntax
also passes the local parser. Homebridge remained running throughout this repair.

## Home Assistant VM

The live host now has VirtualBox 7.2.22 and Home Assistant OS 18.3. The VM uses
2 vCPUs, 4 GB RAM, UEFI and a 64 GB dynamically allocated disk, bridged to its
physical Ethernet adapter. Home Assistant Supervisor reported Connected,
Supported and Healthy; the browser reached owner-account onboarding.

`Manage-HomeAssistantVM.ps1` provides Create, Start, Stop and Status operations.
It must run as **SYSTEM in a scheduled task**, using the isolated VirtualBox
registry at `%ProgramData%\FreeSleepHome\VirtualBox`. Running it directly in a
user PowerShell session is rejected so separate VirtualBox accounts cannot
compete for the same VM. The runtime copy and VM data are protected for SYSTEM
and Administrators only. Create refuses an existing VM or partial directory.
Stop sends ACPI shutdown and reports a timeout rather than forcing power off.

The `FreeSleep-HomeAssistant` scheduled task runs the protected runtime copy
with `-Action Start`, waits 45 seconds after Windows startup and retries an
unavailable network up to five times at one-minute intervals. It requires no
stored Windows password and can also be started from Task Scheduler. Its
first run returned 0 and the guest remained running after the task completed.
Windows reboot recovery is still untested. The current AC power plan already
prevents sleep; the battery power settings were not changed.

VM state: `%ProgramData%\FreeSleepHome\host.json` and `last-operation.json`.
VirtualBox logs: `%ProgramData%\FreeSleepHome\VirtualMachines\FreeSleep-HomeAssistant\Logs`.
Use the guest address reported by its console or mDNS; do not hard-code the
current DHCP lease in a client release. Arrange a router reservation or stable
local DNS before configuring dependent services.

Verified installation artifacts (2026-10-25):

| Artifact | SHA-256 |
| --- | --- |
| Oracle `VirtualBox-7.2.22-175245-Win.exe` | `afd0ff1656cbe04ed88ce619594ae021419d97cce89fa9bdc443e9a963f1713f` |
| HAOS `haos_ova-18.3.vdi.zip` | `c626ffe0db7dd717270b41240ee3cbb5ada78a364239795f04435d6116c236d3` |
| Microsoft signed x64 runtime 14.51.36247.0 | `843068991daaa1f73ad9f6239bce4d0f6a07a51f18c37ea2a867e9beca71295c` |

Oracle's MSI was extracted using `--extract --silent --path`, then installed
with `/qn /norestart REBOOT=ReallySuppress ADDLOCAL=VBoxApplication,VBoxNetworkFlt`.
Both runtime and hypervisor installations returned 0 with no reboot required.
No VirtualBox Extension Pack, USB passthrough or Python API component was installed.
Homebridge and Tailscale services remained running after installation and VM boot.

## Private access, broker and recovery

The owner completed Home Assistant onboarding. The official Mosquitto app 7.1.2
is running with start-on-boot and watchdog enabled. Home Assistant's MQTT
integration is configured with its generated internal credentials. An anonymous
MQTT connection was rejected (CONNACK `0x05`). Dedicated Pod credentials and
topic permissions are still required before connecting the Pod.

`Enable-PrivateHomeAccess.ps1` exposes the managed VM through the Windows host's
existing Tailscale identity. Run it as administrator after the owner has enabled
HTTPS certificates in Tailscale's DNS console and acknowledged the certificate
hostname disclosure. The script refuses conflicting Serve handlers or relays.

```powershell
.\Enable-PrivateHomeAccess.ps1 -Action Enable
.\Enable-PrivateHomeAccess.ps1 -Action Status
# Removes only the service and loopback relay owned by this setup.
.\Enable-PrivateHomeAccess.ps1 -Action Disable
# Pure ownership checks; does not require administrator privileges or change services.
.\Test-PrivateHomeAccess.ps1
```

```mermaid
flowchart LR
  Client[Authorized Tailscale device] -->|TLS 443| Serve[Lenovo Tailscale Serve]
  Serve -->|Decrypted TCP| Relay[Windows loopback 127.0.0.1:18123]
  Relay -->|LAN HTTP| HA[homeassistant.local:80]
  HA --> Login[Home Assistant authentication]
```

This uses TLS-terminated TCP, retaining Home Assistant login and WebSocket
authentication without adding trusted-proxy or authentication-bypass settings.
The Windows relay listens only on loopback and resolves the guest's local
hostname. No Funnel, router forwarding or tailnet access-rule changes are made.
The saved Serve configuration persists across restarts; actual Windows reboot
recovery remains untested. Preserve application authentication and restrict
Tailscale access to authorized devices.

Verified from the Mac: a valid TLS certificate, HTTP 401 on the unauthenticated
API, WebSocket upgrade followed by `auth_required`, and no LAN access to the
Windows loopback relay. The browser reaches Home Assistant's HTTPS login page.
These checks do not establish a signed-in remote session or Pod connectivity.
The Windows PowerShell parser, 13 service-ownership cases and an attended-host
`-WhatIf` check also passed. Ownership checks reject additional ports, handlers,
Funnel settings and destinations belonging to another setup.

Automatic backups are configured daily, retaining seven copies, including
Home Assistant settings/history, all installed apps and the shared folder.
Two completed backups were visible on 2026-10-25. App updates now default to
backing up first and retain one prior version. The owner saved the recovery key
privately. After the in-app browser download failed, the owner downloaded a copy
through Safari. Its outer archive and all five nested compressed archives passed
integrity inspection; a checksum record and owner-only copy are saved outside
Git in `~/Downloads/FreeSleep-Home-Recovery-2026-10-25/`. Home Assistant exported
this copy decrypted (`protected: false`); the Mac reports FileVault enabled.
This is an off-host copy and archive inspection, not a completed restore rehearsal.

The managed VM then passed graceful ACPI shutdown and restart through its SYSTEM
startup task. MQTT recovered and still rejected anonymous connections. Private
HTTPS recovered with a valid certificate, API authentication and WebSocket
`auth_required`. Homebridge and Tailscale remained running. The one-time shutdown
test task was removed after recording successful stop/start results. A Windows
host reboot and a changed guest DHCP lease are separate, still-unperformed tests.

Still required: dedicated Pod MQTT credentials/ACLs, restore testing,
stable guest addressing for dependent clients, and full Windows reboot
testing. The setup SSH service is manual and will need an attended restart after
a Windows reboot. No live Pod or household actuator was changed in this setup.

Sources: [Microsoft OpenSSH installation](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse),
[Windows key authentication](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement),
[OpenSSH host-key permissions](https://github.com/PowerShell/Win32-OpenSSH/wiki/Security-protection-of-various-files-in-win32-openssh),
[Oracle installation](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/installation.html),
[Oracle checksums](https://download.virtualbox.org/virtualbox/7.2.22/SHA256SUMS),
[HAOS release](https://github.com/home-assistant/operating-system/releases/tag/18.3),
[Home Assistant on Windows](https://www.home-assistant.io/installation/windows/),
[MQTT integration](https://www.home-assistant.io/integrations/mqtt/),
[Mosquitto configuration](https://github.com/home-assistant/apps/blob/master/mosquitto/DOCS.md),
[Tailscale Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve),
[Tailscale HTTPS certificates](https://tailscale.com/docs/how-to/set-up-https-certificates).
