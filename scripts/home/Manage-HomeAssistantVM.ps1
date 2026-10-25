#Requires -Version 5.1
#Requires -RunAsAdministrator
<#
.SYNOPSIS
Creates and manages the dedicated Home Assistant VM from a SYSTEM scheduled task.
.DESCRIPTION
Uses one isolated VirtualBox registry so the VM starts without an interactive
Windows login. It never alters Homebridge, accepts a guest password, replaces an
existing VM, or forces a VM power-off. Install VirtualBox separately first.
#>
[CmdletBinding()]
param(
    [ValidateSet('Create', 'Start', 'Stop', 'Status')]
    [string]$Action = 'Status',
    [string]$BridgeInterface = 'Ethernet',
    [string]$ImageArchive = 'C:\ProgramData\FreeSleepSetup\Downloads\haos_ova-18.3.vdi.zip'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$rootDirectory = Join-Path $env:ProgramData 'FreeSleepHome'
$virtualBox = Join-Path $env:ProgramFiles 'Oracle\VirtualBox\VBoxManage.exe'
$vmName = 'FreeSleep-HomeAssistant'
$configurationFile = Join-Path $rootDirectory 'host.json'
$vmDirectory = Join-Path $rootDirectory ('VirtualMachines\' + $vmName)
$diskFile = Join-Path $vmDirectory 'home-assistant.vdi'
$resultFile = Join-Path $rootDirectory 'last-operation.json'

function Invoke-VirtualBox([string[]]$Arguments) {
    # Windows PowerShell turns native stderr progress into ErrorRecords. Check
    # the process exit code without treating a successful progress line as fatal.
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $virtualBox @Arguments 2>&1
        $resultCode = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $previousPreference }
    if ($resultCode -ne 0) { throw "VirtualBox failed ($resultCode): $($output -join ' ')" }
    return $output
}

function Read-VmState {
    $details = Invoke-VirtualBox @('showvminfo', $vmName, '--machinereadable')
    $stateLine = @($details | Where-Object { $_ -match '^VMState=' })
    if ($stateLine.Count -ne 1) { throw 'VirtualBox did not report one VM state.' }
    return ([string]$stateLine[0]).Split('=', 2)[1].Trim('"')
}

function Save-Configuration([object]$Configuration) {
    [IO.File]::WriteAllText($configurationFile, ($Configuration | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))
}

if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne 'S-1-5-18') {
    throw 'Run this script as SYSTEM through its dedicated scheduled task, not from a user VirtualBox session.'
}
if (-not (Test-Path -LiteralPath $virtualBox)) { throw 'Install the verified VirtualBox package first.' }
if ($Action -ne 'Create' -and -not (Test-Path -LiteralPath $configurationFile)) {
    throw 'No managed Home Assistant VM configuration exists.'
}

New-Item -ItemType Directory -Path $rootDirectory -Force | Out-Null
& icacls.exe $rootDirectory '/inheritance:r' '/grant:r' '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not protect the home-host directory.' }
$env:VBOX_USER_HOME = Join-Path $rootDirectory 'VirtualBox'
New-Item -ItemType Directory -Path $env:VBOX_USER_HOME -Force | Out-Null

try {
    if ($Action -eq 'Create') {
        if (Test-Path -LiteralPath $configurationFile) { throw 'A managed VM already exists. Use Start or Status; do not recreate it.' }
        if (Test-Path -LiteralPath $vmDirectory) { throw 'A partial VM directory exists. Inspect it before retrying; no data was replaced.' }
        $machines = @(Invoke-VirtualBox @('list', 'vms'))
        if ($machines.Count -ne 0) { throw 'This isolated VirtualBox registry is not empty. Inspect it before creating a VM.' }
        $processor = Get-CimInstance Win32_Processor
        if (@($processor | Where-Object { -not $_.VirtualizationFirmwareEnabled }).Count) { throw 'Firmware virtualization is not enabled.' }
        if ((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory -lt 8GB) { throw 'At least 8 GB host memory is required for this allocation.' }
        if ((Get-PSDrive -Name ([IO.Path]::GetPathRoot($rootDirectory).Substring(0,1))).Free -lt 75GB) { throw 'At least 75 GB free is required for the guest and host reserve.' }
        $adapter = Get-NetAdapter -Name $BridgeInterface
        if ($adapter.Status -ne 'Up' -or $adapter.Virtual) { throw 'Choose an active physical network adapter.' }
        $checksum = (Get-FileHash -LiteralPath $ImageArchive -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($checksum -ne 'c626ffe0db7dd717270b41240ee3cbb5ada78a364239795f04435d6116c236d3') { throw 'Home Assistant OS archive checksum mismatch.' }
        $imageDirectory = Join-Path $rootDirectory 'Image-18.3'
        if (Test-Path -LiteralPath $imageDirectory) { throw 'A previous image extraction exists; inspect it before retrying.' }
        Expand-Archive -LiteralPath $ImageArchive -DestinationPath $imageDirectory
        $images = @(Get-ChildItem -LiteralPath $imageDirectory -Filter '*.vdi' -Recurse)
        if ($images.Count -ne 1) { throw 'Expected one verified Home Assistant VDI.' }
        Invoke-VirtualBox @('createvm', '--name', $vmName, '--ostype', 'Oracle_64', '--basefolder', (Join-Path $rootDirectory 'VirtualMachines'), '--register') | Out-Null
        Move-Item -LiteralPath $images[0].FullName -Destination $diskFile
        Invoke-VirtualBox @('modifymedium', 'disk', $diskFile, '--resize', '65536') | Out-Null
        Invoke-VirtualBox @('modifyvm', $vmName, '--memory', '4096', '--cpus', '2', '--firmware', 'efi', '--ioapic', 'on', '--rtc-use-utc', 'on', '--graphicscontroller', 'vmsvga', '--vram', '16', '--nic1', 'bridged', '--bridge-adapter1', $adapter.InterfaceDescription, '--nic-type1', '82540EM', '--cable-connected1', 'on', '--boot1', 'disk', '--boot2', 'none', '--boot3', 'none', '--boot4', 'none', '--audio-enabled', 'off', '--clipboard-mode', 'disabled', '--drag-and-drop', 'disabled', '--usb-ohci', 'off', '--usb-ehci', 'off', '--usb-xhci', 'off', '--vrde', 'off') | Out-Null
        Invoke-VirtualBox @('storagectl', $vmName, '--name', 'SATA', '--add', 'sata', '--controller', 'IntelAhci', '--hostiocache', 'off') | Out-Null
        Invoke-VirtualBox @('storageattach', $vmName, '--storagectl', 'SATA', '--port', '0', '--device', '0', '--type', 'hdd', '--medium', $diskFile, '--nonrotational', 'on', '--discard', 'on') | Out-Null
        $configuration = [pscustomobject]@{SchemaVersion=1; Name=$vmName; HostAccount='SYSTEM'; VirtualBoxHome=$env:VBOX_USER_HOME; BridgeInterface=$adapter.Name; BridgeDescription=$adapter.InterfaceDescription; ImageVersion='18.3'; ImageSHA256=$checksum; CPUs=2; MemoryMB=4096; DiskMB=65536; CreatedAt=[DateTime]::UtcNow.ToString('o')}
        Save-Configuration $configuration
    }
    else {
        $configuration = Get-Content -LiteralPath $configurationFile -Raw | ConvertFrom-Json
        if ($configuration.SchemaVersion -ne 1 -or $configuration.Name -ne $vmName -or $configuration.VirtualBoxHome -ne $env:VBOX_USER_HOME) { throw 'Managed VM identity does not match this script.' }
    }

    $state = Read-VmState
    if ($Action -eq 'Start' -and $state -ne 'running') {
        if ($state -notin @('poweroff', 'saved', 'aborted')) { throw "VM cannot start from state $state." }
        if ((Get-NetAdapter -Name $configuration.BridgeInterface).Status -ne 'Up') { throw 'The configured physical network is unavailable.' }
        Invoke-VirtualBox @('startvm', $vmName, '--type', 'headless') | Out-Null
        $state = Read-VmState
        if ($state -ne 'running') { throw "VM did not reach running state: $state" }
    }
    if ($Action -eq 'Stop' -and $state -eq 'running') {
        Invoke-VirtualBox @('controlvm', $vmName, 'acpipowerbutton') | Out-Null
        $deadline = (Get-Date).AddMinutes(2)
        do {
            Start-Sleep -Seconds 3
            $state = Read-VmState
        } while ($state -eq 'running' -and (Get-Date) -lt $deadline)
        if ($state -ne 'poweroff') { throw "Graceful shutdown did not complete ($state). The VM was not forcibly powered off." }
    }
    $result = [pscustomobject]@{Success=$true; Action=$Action; Name=$vmName; State=$state; CompletedAt=[DateTime]::UtcNow.ToString('o')}
    $result | ConvertTo-Json | Set-Content -LiteralPath $resultFile -Encoding UTF8
    $result | ConvertTo-Json
}
catch {
    [pscustomobject]@{Success=$false; Action=$Action; Error=$_.Exception.Message; CompletedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath $resultFile -Encoding UTF8
    throw
}
