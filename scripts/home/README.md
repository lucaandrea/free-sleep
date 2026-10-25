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

Validation so far: PowerShell parser check on macOS. Windows installation,
firewall behavior and authenticated access require live verification; no remote
connection is claimed until that verification succeeds.

Next: inspect existing services, install a supported VirtualBox version from
Oracle, and configure Home Assistant OS with 2 vCPUs, 4 GB RAM, UEFI, a 64 GB
dynamically allocated disk and bridged networking. Configure automatic VM startup
and backups separately after verifying the selected network adapter and storage.

Sources: [Microsoft OpenSSH installation](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse),
[Windows key authentication](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement),
[Home Assistant on Windows](https://www.home-assistant.io/installation/windows/).
