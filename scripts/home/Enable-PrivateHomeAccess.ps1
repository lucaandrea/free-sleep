#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
Publishes the managed Home Assistant VM privately through the Lenovo's Tailscale.
.DESCRIPTION
Uses TLS-terminated TCP, preserving Home Assistant's own login and avoiding
trusted-proxy or authentication-bypass settings. A loopback-only Windows relay
resolves the VM's local hostname instead of pinning a changing DHCP lease.
Never enables Funnel or changes tailnet access rules. Run on the Windows host.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('Enable', 'Disable', 'Status')]
    [string]$Action = 'Status',
    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9-]*\.local$')]
    [string]$GuestHostname = 'homeassistant.local',
    [ValidateRange(1, 65535)]
    [int]$GuestPort = 80
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$rootDirectory = Join-Path $env:ProgramData 'FreeSleepHome'
$recordFile = Join-Path $rootDirectory 'private-access.json'
$tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$relayAddress = '127.0.0.1'
$relayPort = 18123
$relayKey = 'HKLM:\SYSTEM\CurrentControlSet\Services\PortProxy\v4tov4\tcp'
$relayName = "$relayAddress/$relayPort"

function Invoke-Tailscale([string[]]$Arguments) {
    $output = & $tailscale @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Tailscale command failed ($LASTEXITCODE)." }
    return $output
}

function Get-RelayTarget {
    if (-not (Test-Path -LiteralPath $relayKey)) { return $null }
    return (Get-Item -LiteralPath $relayKey).GetValue($relayName)
}

function Get-ServeConfiguration {
    return ((Invoke-Tailscale @('serve', 'status', '--json')) -join "`n") | ConvertFrom-Json
}

function Test-OwnedServe([object]$Configuration) {
    # Compare the complete expected service, refusing unrelated handlers/ports.
    if ($null -eq $Configuration) { return $false }
    $rootKeys = @($Configuration.PSObject.Properties | ForEach-Object { $_.Name })
    if (@($rootKeys | Where-Object { $_ -ne 'TCP' }).Count -ne 0) { return $false }
    if ('TCP' -notin $rootKeys) { return $false }
    if ($null -eq $Configuration.TCP) { return $false }
    $portKeys = @($Configuration.TCP.PSObject.Properties | ForEach-Object { $_.Name })
    if ($portKeys.Count -ne 1 -or '443' -notin $portKeys) { return $false }
    $handler = $Configuration.TCP.'443'
    if ($null -eq $handler) { return $false }
    $handlerKeys = @($handler.PSObject.Properties | ForEach-Object { $_.Name })
    if ($handlerKeys.Count -ne 2 -or 'TCPForward' -notin $handlerKeys -or 'TerminateTLS' -notin $handlerKeys) { return $false }
    return $handler.TCPForward -eq "$relayAddress`:$relayPort" -and $handler.TerminateTLS -eq $script:nodeHostname
}

if (-not (Test-Path -LiteralPath $tailscale)) { throw 'Tailscale is not installed.' }
if (-not (Test-Path -LiteralPath (Join-Path $rootDirectory 'host.json'))) { throw 'Create the managed Home Assistant VM first.' }
$status = ((Invoke-Tailscale @('status', '--json')) -join "`n") | ConvertFrom-Json
if ($status.BackendState -ne 'Running') { throw 'Tailscale must be connected before configuring private access.' }
$script:nodeHostname = $status.Self.DNSName.TrimEnd('.')
if ($script:nodeHostname -notmatch '^[a-zA-Z0-9.-]+\.ts\.net$') { throw 'No valid Tailscale HTTPS hostname is available.' }
$configuration = Get-ServeConfiguration
$relayTarget = Get-RelayTarget
$ownedRecord = if (Test-Path -LiteralPath $recordFile) { Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json } else { $null }

if ($Action -eq 'Status') {
    [pscustomobject]@{Managed=($null -ne $ownedRecord); PrivateURL="https://$script:nodeHostname"; RelayTarget=$relayTarget; Serve=$configuration} | ConvertTo-Json -Depth 8
    return
}

if ($null -ne $ownedRecord -and ($ownedRecord.SchemaVersion -ne 1 -or $ownedRecord.RelayAddress -ne $relayAddress -or $ownedRecord.RelayPort -ne $relayPort -or $ownedRecord.NodeHostname -ne $script:nodeHostname)) { throw 'The saved private-access identity does not match this host.' }
$hasServe = @($configuration.PSObject.Properties).Count -gt 0
if ($hasServe -and ($null -eq $ownedRecord -or -not (Test-OwnedServe $configuration))) { throw 'An existing Tailscale Serve configuration is not owned by this setup. No changes made.' }
$expectedRelay = if ($ownedRecord) { "$($ownedRecord.GuestHostname)/$($ownedRecord.GuestPort)" } else { $null }
if ($relayTarget -and ($null -eq $expectedRelay -or $relayTarget -ne $expectedRelay)) { throw 'The loopback relay is already configured by another owner. No changes made.' }

if ($Action -eq 'Disable') {
    if (-not $ownedRecord) { throw 'No managed private access exists to remove.' }
    if ($PSCmdlet.ShouldProcess($script:nodeHostname, 'Disable only managed private HTTPS and loopback relay')) {
        if ($hasServe) { Invoke-Tailscale @('serve', '--tls-terminated-tcp=443', 'off') | Out-Null }
        if ($relayTarget) {
            & netsh.exe interface portproxy delete v4tov4 "listenaddress=$relayAddress" "listenport=$relayPort" | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Could not remove the managed loopback relay.' }
        }
        Remove-Item -LiteralPath $recordFile
    }
    return
}

$certificateDomains = $status.PSObject.Properties['CertDomains']
if ($null -eq $certificateDomains -or $script:nodeHostname -notin @($certificateDomains.Value)) {
    throw 'Tailscale HTTPS certificates are not enabled for this node. The owner must enable HTTPS Certificates in the Tailscale DNS console first. No new listener was created.'
}
if ($ownedRecord -and ($ownedRecord.GuestHostname -ne $GuestHostname -or $ownedRecord.GuestPort -ne $GuestPort)) { throw 'Disable the existing managed relay before changing its destination.' }
$addresses = @()
# Windows multicast DNS can initially return only IPv6 records. Retry missing A
# records briefly, but never choose arbitrarily between multiple IPv4 hosts.
for ($attempt = 0; $attempt -lt 3 -and $addresses.Count -eq 0; $attempt++) {
    $addresses = @([Net.Dns]::GetHostAddresses($GuestHostname) | Where-Object { $_.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork } | Sort-Object IPAddressToString -Unique)
    if ($addresses.Count -eq 0 -and $attempt -lt 2) { Start-Sleep -Seconds 2 }
}
if ($addresses.Count -ne 1) { throw 'The guest hostname must resolve to exactly one IPv4 address.' }
$address = $addresses[0].GetAddressBytes()
if (-not ($address[0] -eq 10 -or ($address[0] -eq 172 -and $address[1] -ge 16 -and $address[1] -le 31) -or ($address[0] -eq 192 -and $address[1] -eq 168))) { throw 'The guest must resolve to a private LAN address.' }
$response = Invoke-WebRequest -UseBasicParsing -Uri "http://$GuestHostname`:$GuestPort/" -TimeoutSec 10
if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'Home Assistant') { throw 'The guest did not serve the Home Assistant frontend.' }
if (-not $relayTarget -and (Get-NetTCPConnection -LocalPort $relayPort -State Listen -ErrorAction SilentlyContinue)) { throw 'The requested relay port is already in use.' }
if ((Get-Service iphlpsvc).Status -ne 'Running') { throw 'Windows IP Helper must be running for the loopback relay.' }

if ($PSCmdlet.ShouldProcess($script:nodeHostname, 'Enable private TLS on 443 through the loopback relay; preserve Home Assistant login')) {
    $record = [pscustomobject]@{SchemaVersion=1; NodeHostname=$script:nodeHostname; GuestHostname=$GuestHostname; GuestPort=$GuestPort; RelayAddress=$relayAddress; RelayPort=$relayPort; ConfiguredAt=[DateTime]::UtcNow.ToString('o')}
    [IO.File]::WriteAllText($recordFile, ($record | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    if (-not $relayTarget) {
        & netsh.exe interface portproxy add v4tov4 "listenaddress=$relayAddress" "listenport=$relayPort" "connectaddress=$GuestHostname" "connectport=$GuestPort" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Could not create the loopback-only relay.' }
    }
    # The CLI can request an owner consent link if HTTPS is not enabled. It never
    # changes account-level HTTPS/access settings or enables Funnel on its own.
    Invoke-Tailscale @('serve', '--bg', '--tls-terminated-tcp=443', "tcp://$relayAddress`:$relayPort") | Out-Null
    $configuration = Get-ServeConfiguration
    if (-not (Test-OwnedServe $configuration)) { throw 'Private TLS configuration did not match the expected sole handler.' }
    [pscustomobject]@{Success=$true; PrivateURL="https://$script:nodeHostname"; GuestHostname=$GuestHostname; Authentication='Home Assistant login retained'; Exposure='Tailscale only'} | ConvertTo-Json
}
