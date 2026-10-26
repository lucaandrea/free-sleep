#Requires -Version 5.1
<#
.SYNOPSIS
Checks shared service ownership without running either administrator setup tool.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
foreach ($filename in @('PrivateAccess.Common.ps1', 'Enable-PrivateHomeAccess.ps1', 'Enable-PrivatePodAccess.ps1')) {
    $tokens = $null
    $parseErrors = $null
    $null = [Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $filename), [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
}
. (Join-Path $PSScriptRoot 'PrivateAccess.Common.ps1')
$nodeHostname = 'test-host.example.ts.net'
$homeRecord = [pscustomobject]@{SchemaVersion=1; NodeHostname=$nodeHostname; RelayAddress='127.0.0.1'; RelayPort=18123}
$podRecord = [pscustomobject]@{SchemaVersion=1; NodeHostname=$nodeHostname; RelayAddress='127.0.0.1'; ApiRelayPort=18300; StreamRelayPort=18301; ApiPort=8443; StreamPort=3001}
$homePorts = Get-PrivateAccessPorts $homeRecord $null $nodeHostname
$allPorts = Get-PrivateAccessPorts $homeRecord $podRecord $nodeHostname
$homeConfiguration = '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"test-host.example.ts.net"}}}'
$combined = '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"test-host.example.ts.net"},"8443":{"TCPForward":"127.0.0.1:18300","TerminateTLS":"test-host.example.ts.net"},"3001":{"TCPForward":"127.0.0.1:18301","TerminateTLS":"test-host.example.ts.net"}}}'
$partial = '{"TCP":{"3001":{"TCPForward":"127.0.0.1:18301","TerminateTLS":"test-host.example.ts.net"}}}'
$passed = 0
foreach ($example in @('{}', $homeConfiguration, $combined, $partial)) {
    if (-not (Test-PrivateServeConfiguration ($example | ConvertFrom-Json) $allPorts $nodeHostname)) { throw "Rejected an owned recovery state: $example" }
    $passed++
}
if (-not (Test-PrivateServeConfiguration ($homeConfiguration | ConvertFrom-Json) $homePorts $nodeHostname)) { throw 'Existing Home Assistant configuration was rejected.' }
$passed++
if (Test-PrivateServeConfiguration ($combined | ConvertFrom-Json) $homePorts $nodeHostname) { throw 'Pod ports were accepted without an ownership record.' }
$passed++
if (Test-PrivateServeConfiguration ($homeConfiguration | ConvertFrom-Json) @{} $nodeHostname) { throw 'An unowned Home Assistant port was adopted.' }
$passed++
$unowned = @(
    'null', '{"TCP":null}', '{"TCP":{"443":null}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123"}}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"another.example.ts.net"}}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:9999","TerminateTLS":"test-host.example.ts.net"}}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"test-host.example.ts.net","HTTPS":true}}}',
    '{"TCP":{"9999":{"TCPForward":"127.0.0.1:18300","TerminateTLS":"test-host.example.ts.net"}}}',
    '{"TCP":{"8443":{"HTTPS":true}}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"test-host.example.ts.net"}},"AllowFunnel":{"test-host.example.ts.net:443":true}}',
    '{"TCP":{},"Web":{}}'
)
foreach ($example in $unowned) {
    if (Test-PrivateServeConfiguration ($example | ConvertFrom-Json) $allPorts $nodeHostname) { throw "Accepted an unowned configuration: $example" }
    $passed++
}
foreach ($address in @('10.0.1.69', '172.16.0.1', '172.31.255.254', '192.168.1.2')) {
    if (-not (Test-PrivateIPv4 $address)) { throw "Rejected private address $address" }
    $passed++
}
foreach ($address in @('', '10.1', '10.0.0.1/24', '127.0.0.1', '100.64.0.1', '8.8.8.8', '172.32.1.1', '::1', '10.0.0.1;whoami')) {
    if (Test-PrivateIPv4 $address) { throw "Accepted invalid destination $address" }
    $passed++
}
foreach ($field in @('SchemaVersion', 'NodeHostname', 'RelayAddress', 'ApiRelayPort', 'StreamRelayPort', 'ApiPort', 'StreamPort')) {
    $invalid = $podRecord | ConvertTo-Json | ConvertFrom-Json
    $invalid.$field = 'changed'
    $rejected = $false
    try { Get-PrivateAccessPorts $homeRecord $invalid $nodeHostname | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw "Accepted changed identity $field" }
    $passed++
}
if (Test-PrivateServePort ($partial | ConvertFrom-Json) '443') { throw 'Missing home port was reported present.' }
if (-not (Test-PrivateServePort ($partial | ConvertFrom-Json) '3001')) { throw 'Present stream port was missed.' }
$passed += 2
Write-Output "PRIVATE_ACCESS_CHECKS_PASSED: $passed ownership/address cases; PowerShell syntax valid. No service changes."
