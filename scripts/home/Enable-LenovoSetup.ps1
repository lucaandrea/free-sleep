#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
Enables a key-only setup connection through this computer's Tailscale address.
.DESCRIPTION
Run locally on the Windows home host. The listener accepts one supplied Mac
Tailscale IPv4 address and public key. It refuses an existing SSH configuration
it does not own, leaves Homebridge alone, and does not restart Windows.
Use -Action Disable after setup to stop and revoke this connection.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateSet('Enable', 'Disable')]
    [string]$Action = 'Enable',
    [string]$ClientAddress,
    [string]$PublicKey
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$configurationMarker = '# Free Sleep private Lenovo setup v1'
$configurationPath = Join-Path $env:ProgramData 'ssh\sshd_config'
$setupDirectory = Join-Path $env:ProgramData 'FreeSleepSetup'
$authorizedKeysPath = Join-Path $setupDirectory 'authorized_keys'
$firewallRuleName = 'FreeSleep-Setup-Tailscale'
$sshPort = 8823

function Test-TailscaleAddress([string]$Address) {
    $parsedAddress = $null
    if (-not [System.Net.IPAddress]::TryParse($Address, [ref]$parsedAddress)) { return $false }
    $addressBytes = $parsedAddress.GetAddressBytes()
    return $addressBytes.Length -eq 4 -and $addressBytes[0] -eq 100 -and
        $addressBytes[1] -ge 64 -and $addressBytes[1] -le 127
}

function Write-Utf8File([string]$Filename, [string]$Content) {
    [System.IO.File]::WriteAllText($Filename, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Assert-NativeSuccess([string]$Operation) {
    if ($LASTEXITCODE -ne 0) { throw "$Operation failed with exit code $LASTEXITCODE." }
}

$existingConfiguration = if (Test-Path -LiteralPath $configurationPath) {
    [System.IO.File]::ReadAllText($configurationPath)
} else { '' }
if ($existingConfiguration -and -not $existingConfiguration.StartsWith($configurationMarker)) {
    throw 'An existing SSH configuration was found. Nothing changed; inspect it before continuing.'
}

if ($Action -eq 'Disable') {
    if (-not $existingConfiguration.StartsWith($configurationMarker)) {
        throw 'No Free Sleep setup listener was found. Nothing changed.'
    }
    if ($PSCmdlet.ShouldProcess('Free Sleep setup SSH access', 'Stop service and revoke setup key')) {
        Stop-Service sshd -ErrorAction Stop
        Set-Service sshd -StartupType Manual
        Get-NetFirewallRule -Name $firewallRuleName -ErrorAction SilentlyContinue | Disable-NetFirewallRule | Out-Null
        # Revoke only the key/configuration created by this script. Leave host keys and the Windows feature installed.
        if (Test-Path -LiteralPath $authorizedKeysPath) { Remove-Item -LiteralPath $authorizedKeysPath }
        Remove-Item -LiteralPath $configurationPath
        Write-Output 'SETUP_SSH_DISABLED'
    }
    return
}

if (-not (Test-TailscaleAddress $ClientAddress)) { throw 'ClientAddress must be the Mac Tailscale IPv4 address.' }
if ($PublicKey -notmatch '^ssh-ed25519 [A-Za-z0-9+/]{68}( [A-Za-z0-9@._-]+)?$') {
    throw 'Supply one unmodified Ed25519 public key, never a private key.'
}
$accountName = [Environment]::UserName.ToLowerInvariant()
if ($accountName -notmatch '^[a-z0-9._-]+$') { throw 'This account name needs a reviewed SSH configuration.' }
$localAccount = Get-LocalUser -Name $accountName
if (-not $localAccount.Enabled) { throw 'The local Windows account is disabled.' }
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($localAccount.SID.Value -ne $currentIdentity.User.Value) { throw 'Run using the Lenovo local owner account.' }

$tailscaleCommand = Get-Command tailscale.exe -ErrorAction SilentlyContinue
$tailscaleExecutable = if ($tailscaleCommand) { $tailscaleCommand.Source } else {
    Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
}
if (-not (Test-Path -LiteralPath $tailscaleExecutable)) { throw 'Tailscale is not installed at its expected location.' }
$serverAddress = (& $tailscaleExecutable ip -4 | Select-Object -First 1).Trim()
Assert-NativeSuccess 'Read Tailscale address'
if (-not (Test-TailscaleAddress $serverAddress) -or $serverAddress -eq $ClientAddress) {
    throw 'The Lenovo needs its own connected Tailscale IPv4 address.'
}
if (-not (Get-NetIPAddress -AddressFamily IPv4 -IPAddress $serverAddress -ErrorAction SilentlyContinue)) {
    throw 'The Tailscale address is not currently assigned. Connect Tailscale first.'
}
$existingService = Get-Service sshd -ErrorAction SilentlyContinue
if ($existingService -and $existingService.Status -eq 'Running' -and -not $existingConfiguration) {
    throw 'An existing SSH service is running. Nothing changed; inspect it before continuing.'
}
$capability = Get-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0'
if (-not $PSCmdlet.ShouldProcess("${accountName}@${serverAddress}:$sshPort", 'Enable key-only access from the supplied Mac')) { return }

$installedNow = $capability.State -ne 'Installed'
if ($installedNow) {
    $installation = Add-WindowsCapability -Online -Name $capability.Name
    Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue | Disable-NetFirewallRule | Out-Null
    Stop-Service sshd -ErrorAction SilentlyContinue
    if ($installation.RestartNeeded) { throw 'Windows requires a restart before setup can continue. The setup listener was not started.' }
}
$sshDirectory = Join-Path $env:WINDIR 'System32\OpenSSH'
$sshdExecutable = Join-Path $sshDirectory 'sshd.exe'
$keygenExecutable = Join-Path $sshDirectory 'ssh-keygen.exe'
if (-not (Test-Path -LiteralPath $sshdExecutable)) { throw 'The Windows OpenSSH server installation did not complete.' }

try {
    # Installation may add a broad default port-22 rule. Restrict the new installation before starting anything.
    if ($installedNow) {
        Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue | Disable-NetFirewallRule | Out-Null
    }
    Stop-Service sshd -ErrorAction Stop
    Set-Service sshd -StartupType Manual
    New-Item -ItemType Directory -Force -Path $setupDirectory | Out-Null
    & icacls.exe $setupDirectory '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
    Assert-NativeSuccess 'Restrict setup directory permissions'
    Write-Utf8File $authorizedKeysPath ('from="' + $ClientAddress + '",no-agent-forwarding,no-port-forwarding,no-X11-forwarding ' + $PublicKey + "`n")
    & icacls.exe $authorizedKeysPath '/inheritance:r' '/grant:r' '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null
    Assert-NativeSuccess 'Restrict public-key file permissions'
    New-Item -ItemType Directory -Force -Path (Split-Path $configurationPath) | Out-Null
    & $keygenExecutable -A
    Assert-NativeSuccess 'Generate missing SSH host keys'
    $unixAuthorizedKeysPath = $authorizedKeysPath.Replace('\', '/')
    $hostKeyPath = (Join-Path $env:ProgramData 'ssh\ssh_host_ed25519_key').Replace('\', '/')
    $configuration = @"
$configurationMarker
Port $sshPort
AddressFamily inet
ListenAddress $serverAddress
HostKey "$hostKeyPath"
AllowUsers $accountName
PubkeyAuthentication yes
AuthenticationMethods publickey
PasswordAuthentication no
ChallengeResponseAuthentication no
PermitEmptyPasswords no
AuthorizedKeysFile "$unixAuthorizedKeysPath"
AllowAgentForwarding no
AllowTcpForwarding no
X11Forwarding no
LoginGraceTime 30
MaxAuthTries 3
Subsystem sftp sftp-server.exe
"@
    Write-Utf8File $configurationPath ($configuration + "`n")
    & $sshdExecutable -t -f $configurationPath
    Assert-NativeSuccess 'Validate restricted SSH configuration'
    # Recreate only our dedicated rule, preserving unrelated firewall and Homebridge configuration.
    Get-NetFirewallRule -Name $firewallRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -Name $firewallRuleName -DisplayName 'Free Sleep setup over Tailscale' -Enabled True `
        -Direction Inbound -Protocol TCP -Action Allow -LocalPort $sshPort -LocalAddress $serverAddress `
        -RemoteAddress $ClientAddress -Profile Any -Program $sshdExecutable | Out-Null
    Start-Service sshd
    $listener = Get-NetTCPConnection -State Listen -LocalPort $sshPort -ErrorAction Stop
    if (@($listener | Where-Object LocalAddress -ne $serverAddress).Count -gt 0) {
        throw 'The SSH listener bound an unexpected address.'
    }
    Write-Output "SETUP_SSH_READY ${accountName}@${serverAddress} port $sshPort"
    & $keygenExecutable -lf (Join-Path $env:ProgramData 'ssh\ssh_host_ed25519_key.pub')
    Assert-NativeSuccess 'Read host-key fingerprint'
    Write-Output 'The service is manual: a Windows restart stops setup access until you start it again.'
}
catch {
    # A partial setup must leave no listener accepting connections.
    Stop-Service sshd -ErrorAction SilentlyContinue
    Get-NetFirewallRule -Name $firewallRuleName -ErrorAction SilentlyContinue | Disable-NetFirewallRule | Out-Null
    throw
}
