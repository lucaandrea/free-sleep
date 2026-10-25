#Requires -Version 5.1
<#
.SYNOPSIS
Checks configuration ownership without running the administrator setup script.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$sourceFile = Join-Path $PSScriptRoot 'Enable-PrivateHomeAccess.ps1'
$tokens = $null
$parseErrors = $null
$syntax = [Management.Automation.Language.Parser]::ParseFile($sourceFile, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
$ownershipFunction = $syntax.Find({
    param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Test-OwnedServe'
}, $true)
if ($null -eq $ownershipFunction) { throw 'Ownership validation function is missing.' }
# Load only the pure ownership check; never evaluate the host setup entry point.
. ([scriptblock]::Create($ownershipFunction.Extent.Text))
$relayAddress = '127.0.0.1'
$relayPort = 18123
$script:nodeHostname = 'test-host.example.ts.net'
$expected = '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"test-host.example.ts.net"}}}'
if (-not (Test-OwnedServe ($expected | ConvertFrom-Json))) { throw 'The exact owned service was rejected.' }
$unowned = @(
    'null', '{}', '{"TCP":null}', '{"TCP":{}}', '{"TCP":{"443":null}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123"}}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"another.example.ts.net"}}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:9999","TerminateTLS":"test-host.example.ts.net"}}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"test-host.example.ts.net","HTTPS":true}}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"test-host.example.ts.net"},"8443":{"HTTPS":true}}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"test-host.example.ts.net"}},"AllowFunnel":{"test-host.example.ts.net:443":true}}',
    '{"TCP":{"443":{"TCPForward":"127.0.0.1:18123","TerminateTLS":"test-host.example.ts.net"}},"Web":{}}'
)
foreach ($example in $unowned) {
    if (Test-OwnedServe ($example | ConvertFrom-Json)) { throw "Accepted an unowned configuration: $example" }
}
Write-Output "PRIVATE_ACCESS_CHECKS_PASSED: $($unowned.Count + 1) ownership cases; PowerShell syntax valid."
