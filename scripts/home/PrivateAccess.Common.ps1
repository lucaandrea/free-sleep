# Pure ownership checks shared by the Home Assistant and Pod access tools.
function Get-PrivateAccessPorts([object]$HomeRecord, [object]$PodRecord, [string]$NodeHostname) {
    $ports = @{}
    if ($null -ne $HomeRecord) {
        if ($HomeRecord.SchemaVersion -ne 1 -or $HomeRecord.NodeHostname -ne $NodeHostname -or
            $HomeRecord.RelayAddress -ne '127.0.0.1' -or $HomeRecord.RelayPort -ne 18123) {
            throw 'The saved Home Assistant access identity does not match this host.'
        }
        $ports['443'] = '127.0.0.1:18123'
    }
    if ($null -ne $PodRecord) {
        if ($PodRecord.SchemaVersion -ne 1 -or $PodRecord.NodeHostname -ne $NodeHostname -or
            $PodRecord.RelayAddress -ne '127.0.0.1' -or $PodRecord.ApiRelayPort -ne 18300 -or
            $PodRecord.StreamRelayPort -ne 18301 -or $PodRecord.ApiPort -ne 8443 -or $PodRecord.StreamPort -ne 3001) {
            throw 'The saved Pod access identity does not match this host.'
        }
        $ports['8443'] = '127.0.0.1:18300'
        $ports['3001'] = '127.0.0.1:18301'
    }
    return $ports
}

function Test-PrivateServeConfiguration([object]$Configuration, [hashtable]$OwnedPorts, [string]$NodeHostname) {
    # A partial owned configuration permits recovery after an interrupted setup.
    # Every present handler must be exact; Funnel and unrelated services are refused.
    if ($null -eq $Configuration) { return $false }
    $rootKeys = @($Configuration.PSObject.Properties | ForEach-Object { $_.Name })
    if ($rootKeys.Count -eq 0) { return $true }
    if ($rootKeys.Count -ne 1 -or $rootKeys[0] -ne 'TCP' -or $null -eq $Configuration.TCP) { return $false }
    foreach ($property in $Configuration.TCP.PSObject.Properties) {
        if (-not $OwnedPorts.ContainsKey($property.Name) -or $null -eq $property.Value) { return $false }
        $handler = $property.Value
        $keys = @($handler.PSObject.Properties | ForEach-Object { $_.Name })
        if ($keys.Count -ne 2 -or 'TCPForward' -notin $keys -or 'TerminateTLS' -notin $keys) { return $false }
        if ($handler.TCPForward -ne $OwnedPorts[$property.Name] -or $handler.TerminateTLS -ne $NodeHostname) { return $false }
    }
    return $true
}

function Test-PrivateServePort([object]$Configuration, [string]$Port) {
    $tcp = $Configuration.PSObject.Properties['TCP']
    return $null -ne $tcp -and $null -ne $tcp.Value -and $null -ne $tcp.Value.PSObject.Properties[$Port]
}

function Test-PrivateIPv4([string]$Address) {
    $parsed = $null
    if (-not [Net.IPAddress]::TryParse($Address, [ref]$parsed) -or
        $parsed.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or $parsed.ToString() -ne $Address) { return $false }
    $bytes = $parsed.GetAddressBytes()
    return $bytes[0] -eq 10 -or ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) -or ($bytes[0] -eq 192 -and $bytes[1] -eq 168)
}
