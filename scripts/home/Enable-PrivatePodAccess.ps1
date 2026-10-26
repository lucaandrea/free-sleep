#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
Adds private Core HTTPS and sensor streaming alongside managed Home Assistant.
.DESCRIPTION
Run only after the controller handoff has passed. Preserves application
authentication, Host/Origin headers and Home Assistant's port 443. No owner key
is stored on Windows. No Funnel, LAN listener or router forwarding is created.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('Enable', 'Disable', 'Status')][string]$Action = 'Status',
    [string]$PodAddress
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. (Join-Path $PSScriptRoot 'PrivateAccess.Common.ps1')
$rootDirectory = Join-Path $env:ProgramData 'FreeSleepHome'
$recordFile = Join-Path $rootDirectory 'private-pod-access.json'
$homeRecordFile = Join-Path $rootDirectory 'private-access.json'
$tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$relayKey = 'HKLM:\SYSTEM\CurrentControlSet\Services\PortProxy\v4tov4\tcp'
$routes = @(
    [pscustomobject]@{Port=8443; RelayPort=18300; DestinationPort=3000},
    [pscustomobject]@{Port=3001; RelayPort=18301; DestinationPort=3001}
)

function Invoke-Tailscale([string[]]$Arguments) {
    $output = & $tailscale @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Tailscale command failed ($LASTEXITCODE)." }
    return $output
}
function Get-ServeConfiguration {
    return ((Invoke-Tailscale @('serve', 'status', '--json')) -join "`n") | ConvertFrom-Json
}
function Get-RelayTarget([int]$Port) {
    if (-not (Test-Path -LiteralPath $relayKey)) { return $null }
    return (Get-Item -LiteralPath $relayKey).GetValue("127.0.0.1/$Port")
}

if (-not (Test-Path -LiteralPath $tailscale) -or -not (Test-Path -LiteralPath (Join-Path $rootDirectory 'host.json'))) { throw 'The managed Lenovo home host and Tailscale must exist first.' }
$status = ((Invoke-Tailscale @('status', '--json')) -join "`n") | ConvertFrom-Json
if ($status.BackendState -ne 'Running') { throw 'Tailscale must be connected.' }
$nodeHostname = $status.Self.DNSName.TrimEnd('.')
if ($nodeHostname -notmatch '^[a-zA-Z0-9.-]+\.ts\.net$') { throw 'No valid Tailscale hostname is available.' }
$configuration = Get-ServeConfiguration
$ownedRecord = if (Test-Path -LiteralPath $recordFile) { Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json } else { $null }
$homeRecord = if (Test-Path -LiteralPath $homeRecordFile) { Get-Content -LiteralPath $homeRecordFile -Raw | ConvertFrom-Json } else { $null }
$ownedPorts = Get-PrivateAccessPorts $homeRecord $ownedRecord $nodeHostname
if (-not (Test-PrivateServeConfiguration $configuration $ownedPorts $nodeHostname)) { throw 'Unowned Serve configuration; no changes made.' }
if ($ownedRecord -and -not (Test-PrivateIPv4 $ownedRecord.PodAddress)) { throw 'Invalid saved Pod address.' }
foreach ($route in $routes) {
    $relayTarget = Get-RelayTarget $route.RelayPort
    $expected = if ($ownedRecord) { "$($ownedRecord.PodAddress)/$($route.DestinationPort)" } else { $null }
    if ($relayTarget -and ($null -eq $expected -or $relayTarget -ne $expected)) { throw 'Unowned loopback relay; no changes made.' }
    if (-not $relayTarget -and (Get-NetTCPConnection -LocalPort $route.RelayPort -State Listen -ErrorAction SilentlyContinue)) { throw 'A relay port is already in use.' }
}
if ($Action -eq 'Status') {
    [pscustomobject]@{Managed=($null -ne $ownedRecord); PrivateURL="https://$nodeHostname`:8443"; SensorURL="wss://$nodeHostname`:3001"; Serve=$configuration} | ConvertTo-Json -Depth 8
    return
}
if ($Action -eq 'Disable') {
    if (-not $ownedRecord) { throw 'No managed Pod access exists to remove.' }
    if ($PSCmdlet.ShouldProcess($nodeHostname, 'Remove only managed Pod HTTPS, sensor listener and loopback relays')) {
        foreach ($route in $routes) {
            if (Test-PrivateServePort $configuration ([string]$route.Port)) { Invoke-Tailscale @('serve', "--tls-terminated-tcp=$($route.Port)", 'off') | Out-Null }
            if (Get-RelayTarget $route.RelayPort) {
                & netsh.exe interface portproxy delete v4tov4 'listenaddress=127.0.0.1' "listenport=$($route.RelayPort)" | Out-Null
                if ($LASTEXITCODE -ne 0) { throw 'Could not remove an owned Pod relay; retry Disable.' }
            }
        }
        Remove-Item -LiteralPath $recordFile
    }
    return
}

if (-not (Test-PrivateIPv4 $PodAddress)) { throw 'Supply the verified private IPv4 address of the Pod.' }
if ($ownedRecord -and $ownedRecord.PodAddress -ne $PodAddress) { throw 'Disable the existing Pod relay before changing its destination.' }
$certificateDomains = $status.PSObject.Properties['CertDomains']
if ($null -eq $certificateDomains -or $nodeHostname -notin @($certificateDomains.Value)) { throw 'The owner must first enable Tailscale HTTPS certificates.' }
if ((Get-Service iphlpsvc).Status -ne 'Running') { throw 'Windows IP Helper must be running.' }
# Public readiness contains no key or biometrics. Never redirect this probe.
$response = Invoke-WebRequest -UseBasicParsing -Uri "http://$PodAddress`:3000/api/auth/session" -MaximumRedirection 0 -TimeoutSec 10
$session = $response.Content | ConvertFrom-Json
if ($response.StatusCode -ne 200 -or $session.configured -ne $true -or $session.authenticated -ne $false) { throw 'Core must expose a configured authentication boundary before publishing access.' }
$unauthorized = $false
try {
    Invoke-WebRequest -UseBasicParsing -Uri "http://$PodAddress`:3000/api/v1/capabilities" -MaximumRedirection 0 -TimeoutSec 10 | Out-Null
} catch {
    if ($null -ne $_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) { $unauthorized = $true } else { throw }
}
if (-not $unauthorized) { throw 'The Core API did not reject an unauthenticated request.' }

if ($PSCmdlet.ShouldProcess($nodeHostname, 'Add private Core TLS ports 8443 and 3001, preserving Home Assistant')) {
    # Save ownership before any mutation so partial failures can be safely removed.
    $record = [pscustomobject]@{SchemaVersion=1; NodeHostname=$nodeHostname; PodAddress=$PodAddress; RelayAddress='127.0.0.1'; ApiRelayPort=18300; StreamRelayPort=18301; ApiPort=8443; StreamPort=3001; ConfiguredAt=[DateTime]::UtcNow.ToString('o')}
    [IO.File]::WriteAllText($recordFile, ($record | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    foreach ($route in $routes) {
        if (-not (Get-RelayTarget $route.RelayPort)) {
            & netsh.exe interface portproxy add v4tov4 'listenaddress=127.0.0.1' "listenport=$($route.RelayPort)" "connectaddress=$PodAddress" "connectport=$($route.DestinationPort)" | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Could not create a Pod relay; retry Enable or Disable.' }
        }
        Invoke-Tailscale @('serve', '--bg', "--tls-terminated-tcp=$($route.Port)", "tcp://127.0.0.1:$($route.RelayPort)") | Out-Null
    }
    $configuration = Get-ServeConfiguration
    $ownedPorts = Get-PrivateAccessPorts $homeRecord $record $nodeHostname
    if (-not (Test-PrivateServeConfiguration $configuration $ownedPorts $nodeHostname) -or
        -not (Test-PrivateServePort $configuration '8443') -or -not (Test-PrivateServePort $configuration '3001')) { throw 'Pod access configuration is incomplete; inspect it before provisioning clients.' }
    [pscustomobject]@{Success=$true; PrivateURL="https://$nodeHostname`:8443"; SensorURL="wss://$nodeHostname`:3001"; Authentication='Core owner authentication retained'; Exposure='Tailscale only'; PodAddress=$PodAddress} | ConvertTo-Json
}
