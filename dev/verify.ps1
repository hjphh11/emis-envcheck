# ============================================================
#  dev/verify.ps1 - contract self-check for scan.ps1 output
#
#  Reads dev/sample-scan.json and validates it against src/types.ts:
#    - file is valid UTF-8 JSON without BOM
#    - all 13 top-level ScanResult sections exist
#    - every documented field exists and has the right type / nullability
#    - no "" / "N/A" / -1 sentinels for unknown values
#    - date-time strings are ISO-8601 with a UTC offset
#    - compat items >= 11, status enum valid, counts/verdict consistent
#    - score parts/weights/level consistent
#    - no mojibake (U+FFFD) in embedded Chinese text
#
#  Usage:
#    pwsh -NoProfile -File dev/verify.ps1
#    pwsh -NoProfile -File dev/verify.ps1 -Path other-scan.json
#  Exit code: 0 = all checks passed, 1 = at least one failure.
# ============================================================
param(
    [string]$Path = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dev/sample-scan.json')
)

$ErrorActionPreference = 'Stop'

# Expected Chinese enum values are built from code points so this file stays pure ASCII
# (it may be read by Windows PowerShell 5.1, which decodes BOM-less files as ANSI).
$TypeEthernet = -join @([char]0x4EE5, [char]0x592A, [char]0x7F51)   # "Ethernet"
$TypeOther = -join @([char]0x5176, [char]0x4ED6)                     # "Other"

$script:PassCount = 0
$script:FailCount = 0
$script:Failures = New-Object System.Collections.Generic.List[string]

function Check {
    param([string]$Name, [bool]$Ok, [string]$Detail = '')
    if ($Ok) {
        $script:PassCount++
        Write-Host ('PASS  ' + $Name)
    } else {
        $script:FailCount++
        $script:Failures.Add($Name + $(if ($Detail) { ' :: ' + $Detail } else { '' }))
        Write-Host ('FAIL  ' + $Name + $(if ($Detail) { ' :: ' + $Detail } else { '' }))
    }
}

function Test-Num {
    param($Value)
    return ($Value -is [int] -or $Value -is [long] -or $Value -is [double] -or $Value -is [decimal] -or $Value -is [single])
}

function Test-Str {
    param($Value)
    return ($Value -is [string])
}

function Test-Arr {
    param($Value)
    return ($Value -is [array] -or $Value -is [System.Collections.IList]) -and -not (Test-Str $Value)
}

function Test-Iso {
    param($Value)
    # ConvertFrom-Json turns ISO strings into DateTime; both are accepted here, but the
    # raw JSON text is additionally checked below to make sure the file itself holds ISO.
    if ($Value -is [datetime]) { return $true }
    if ($Value -is [datetimeoffset]) { return $true }
    if (-not (Test-Str $Value)) { return $false }
    return ($Value -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$')
}

function Get-PropNames {
    param($Obj)
    if ($null -eq $Obj) { return @() }
    return @($Obj.PSObject.Properties.Name)
}

# Validate that a section object contains exactly the expected field names and no empties are
# produced; also checks that every required (non-nullable) field is present.
function Test-Section {
    param([string]$Section, $Obj, [string[]]$Required, [string[]]$Nullable = @(), [string[]]$Optional = @())
    if ($null -eq $Obj) {
        Check ("section " + $Section + " exists") $false 'object is null'
        return
    }
    Check ("section " + $Section + " exists") $true
    $names = Get-PropNames $Obj
    $missing = @()
    foreach ($field in $Required) {
        if ($names -notcontains $field) { $missing += $field }
    }
    Check ("section " + $Section + " has all required fields") ($missing.Count -eq 0) ('missing: ' + ($missing -join ', '))
    $extra = @()
    foreach ($field in $names) {
        if ($Required -notcontains $field -and $Nullable -notcontains $field -and $Optional -notcontains $field) { $extra += $field }
    }
    Check ("section " + $Section + " has no unexpected fields") ($extra.Count -eq 0) ('extra: ' + ($extra -join ', '))
    # every present field must not be an empty string
    $emptyFields = @()
    foreach ($field in $names) {
        $v = $Obj.$field
        if ((Test-Str $v) -and $v.Length -eq 0) { $emptyFields += $field }
    }
    Check ("section " + $Section + " has no empty strings") ($emptyFields.Count -eq 0) ('empty: ' + ($emptyFields -join ', '))
}

function Test-StrField {
    param([string]$Label, $Value, [bool]$Nullable = $true, [bool]$Iso = $false)
    if ($null -eq $Value) {
        Check ($Label + ' is null-or-string') $Nullable 'got null but field is required'
        return
    }
    if ($Value -is [datetime] -or $Value -is [datetimeoffset]) {
        # ConvertFrom-Json auto-converts ISO strings; the raw JSON text check covers the format.
        Check ($Label + ' is ISO-8601') $Iso ([string]$Value)
        return
    }
    $ok = (Test-Str $Value) -and ($Value.Length -gt 0)
    if ($ok -and $Iso) { $ok = Test-Iso $Value }
    Check ($Label + $(if ($Iso) { ' is ISO-8601' } else { ' is non-empty string' })) $ok ([string]$Value)
}

function Test-NumField {
    param([string]$Label, $Value, [bool]$Nullable = $true, [double]$Min = -1e18, [double]$Max = 1e18)
    if ($null -eq $Value) {
        Check ($Label + ' is null-or-number') $Nullable 'got null but field is required'
        return
    }
    $ok = (Test-Num $Value) -and ($Value -ge $Min) -and ($Value -le $Max)
    Check ($Label + ' is number') $ok ([string]$Value)
}

function Test-BoolField {
    param([string]$Label, $Value, [bool]$Nullable = $true)
    if ($null -eq $Value) {
        Check ($Label + ' is null-or-bool') $Nullable 'got null but field is required'
        return
    }
    Check ($Label + ' is boolean') ($Value -is [bool]) ([string]$Value)
}

function Test-ArrField {
    param([string]$Label, $Value)
    Check ($Label + ' is array') (Test-Arr $Value) ($Value.GetType().Name)
}

Write-Host ('== verify scan result: ' + $Path)
if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host 'FAIL  file exists'
    exit 1
}
Check 'file exists' $true

# ---- encoding ----
$bytes = [System.IO.File]::ReadAllBytes($Path)
$hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
Check 'file is UTF-8 without BOM' (-not $hasBom) 'starts with UTF-8 BOM'
$utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
$jsonText = $null
try {
    $jsonText = $utf8Strict.GetString($bytes)
    Check 'file is valid UTF-8' $true
} catch {
    Check 'file is valid UTF-8' $false $_.Exception.Message
    exit 1
}
Check 'file has no U+FFFD (mojibake)' (-not $jsonText.Contains([string][char]0xFFFD)) 'replacement character found'

$j = $null
try {
    $j = $jsonText | ConvertFrom-Json
    Check 'JSON parses' $true
} catch {
    Check 'JSON parses' $false $_.Exception.Message
    exit 1
}

# ---- top level ----
$expectedSections = @('meta', 'system', 'motherboard', 'cpu', 'memory', 'gpus', 'displays', 'disks', 'network', 'runtime', 'security', 'compat', 'score')
$topNames = Get-PropNames $j
$missingTop = @()
foreach ($name in $expectedSections) { if ($topNames -notcontains $name) { $missingTop += $name } }
Check 'all 13 top-level sections present' ($missingTop.Count -eq 0) ('missing: ' + ($missingTop -join ', '))

# ---- no sentinel strings anywhere ----
$flat = $jsonText
Check 'no "N/A" sentinel' (-not ($flat -match '"N/A"')) 'found "N/A"'
Check 'no quote-empty sentinel' (-not ($flat -match '"activation"\s*:\s*""|"firewall"\s*:\s*""|"uac"\s*:\s*""')) 'found "" for a nullable text field'

# ---- raw JSON date fields must be ISO-8601 strings WITH a UTC offset ----
# (ConvertFrom-Json converts them to [datetime], so the file text has to be checked directly.)
$rawDateFields = @('generatedAt', 'installDate', 'lastBoot', 'biosDate', 'driverDate')
$badDates = @()
$isoCount = 0
foreach ($dateField in $rawDateFields) {
    $datePattern = '"' + [regex]::Escape($dateField) + '"\s*:\s*"([^"]*)"'
    foreach ($dateMatch in [regex]::Matches($jsonText, $datePattern)) {
        $dateValue = $dateMatch.Groups[1].Value
        if ($dateValue -match '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$') {
            $isoCount++
        } else {
            $badDates += ($dateField + '=' + $dateValue)
        }
    }
}
Check 'raw JSON date fields are ISO-8601 with offset' ($badDates.Count -eq 0) ($badDates -join '; ')
Check 'raw JSON contains ISO date values' ($isoCount -gt 0) 'no ISO date fields found'

# ---- meta ----
Test-Section 'meta' $j.meta @('scanMs', 'generatedAt', 'isAdmin', 'elevationGains', 'warnings', 'collectorVersion')
Test-NumField 'meta.scanMs' $j.meta.scanMs $false 1 60000
Test-StrField 'meta.generatedAt' $j.meta.generatedAt $false $true
Test-BoolField 'meta.isAdmin' $j.meta.isAdmin $false
Test-ArrField 'meta.elevationGains' $j.meta.elevationGains
Test-ArrField 'meta.warnings' $j.meta.warnings
Test-StrField 'meta.collectorVersion' $j.meta.collectorVersion $false
Check 'meta.scanMs <= 8000' ($j.meta.scanMs -le 8000) ([string]$j.meta.scanMs)
foreach ($w in @($j.meta.warnings)) { Check 'warning entry is non-empty string' ((Test-Str $w) -and $w.Length -gt 0) ([string]$w) }
if ($j.meta.isAdmin -eq $false) {
    Check 'non-admin has elevationGains hints' (@($j.meta.elevationGains).Count -gt 0) 'empty'
    Check 'non-admin has warnings explaining limits' (@($j.meta.warnings).Count -gt 0) 'empty'
}

# ---- system ----
Test-Section 'system' $j.system @(
    'caption', 'osName', 'version', 'build', 'ubr', 'displayVersion', 'arch', 'installDate', 'lastBoot',
    'uptimeSec', 'activation', 'activationType', 'powerPlan', 'fastStartup', 'bitLocker', 'hyperV',
    'manufacturer', 'model', 'serial', 'domain', 'timeZone', 'hostname', 'username', 'resolution', 'refreshHz'
) @(
    'ubr', 'displayVersion', 'installDate', 'lastBoot', 'activation', 'activationType', 'powerPlan',
    'fastStartup', 'bitLocker', 'hyperV', 'manufacturer', 'model', 'serial', 'domain', 'timeZone', 'resolution', 'refreshHz'
)
Test-StrField 'system.caption' $j.system.caption $false
Test-StrField 'system.osName' $j.system.osName $false
Test-StrField 'system.version' $j.system.version $false
Test-StrField 'system.build' $j.system.build $false
Test-StrField 'system.arch' $j.system.arch $false
Test-StrField 'system.hostname' $j.system.hostname $false
Test-StrField 'system.username' $j.system.username $false
Test-StrField 'system.ubr' $j.system.ubr
Test-StrField 'system.displayVersion' $j.system.displayVersion
Test-StrField 'system.installDate' $j.system.installDate $true $true
Test-StrField 'system.lastBoot' $j.system.lastBoot $true $true
Test-NumField 'system.uptimeSec' $j.system.uptimeSec $false 0 315360000
Test-StrField 'system.activation' $j.system.activation
Test-StrField 'system.activationType' $j.system.activationType
Test-StrField 'system.powerPlan' $j.system.powerPlan
Test-BoolField 'system.fastStartup' $j.system.fastStartup
Test-StrField 'system.bitLocker' $j.system.bitLocker
Test-BoolField 'system.hyperV' $j.system.hyperV
Test-StrField 'system.manufacturer' $j.system.manufacturer
Test-StrField 'system.model' $j.system.model
Test-StrField 'system.serial' $j.system.serial
Test-StrField 'system.domain' $j.system.domain
Test-StrField 'system.timeZone' $j.system.timeZone
if ($null -ne $j.system.resolution) {
    Check 'system.resolution is WxH' ($j.system.resolution -match '^\d+x\d+$') ([string]$j.system.resolution)
}
Test-NumField 'system.refreshHz' $j.system.refreshHz $true 1 1000

# ---- motherboard ----
Test-Section 'motherboard' $j.motherboard @(
    'vendor', 'model', 'version', 'serial', 'biosVendor', 'biosVersion', 'biosDate',
    'firmwareMode', 'secureBoot', 'tpmVersion', 'tpmEnabled'
)
Test-StrField 'motherboard.vendor' $j.motherboard.vendor
Test-StrField 'motherboard.model' $j.motherboard.model
Test-StrField 'motherboard.version' $j.motherboard.version
Test-StrField 'motherboard.serial' $j.motherboard.serial
Test-StrField 'motherboard.biosVendor' $j.motherboard.biosVendor
Test-StrField 'motherboard.biosVersion' $j.motherboard.biosVersion
Test-StrField 'motherboard.biosDate' $j.motherboard.biosDate $true $true
Check 'motherboard.firmwareMode enum' ($null -eq $j.motherboard.firmwareMode -or $j.motherboard.firmwareMode -in @('UEFI', 'Legacy')) ([string]$j.motherboard.firmwareMode)
Test-BoolField 'motherboard.secureBoot' $j.motherboard.secureBoot
Test-StrField 'motherboard.tpmVersion' $j.motherboard.tpmVersion
Test-BoolField 'motherboard.tpmEnabled' $j.motherboard.tpmEnabled

# ---- cpu ----
Test-Section 'cpu' $j.cpu @(
    'brand', 'vendor', 'physicalCores', 'logicalCores', 'baseMhz', 'maxMhz', 'currentMhz',
    'l2Bytes', 'l3Bytes', 'socket', 'virtualization', 'instructions', 'arch', 'usagePct'
) @(
    'vendor', 'physicalCores', 'logicalCores', 'baseMhz', 'maxMhz', 'currentMhz', 'l2Bytes', 'l3Bytes',
    'socket', 'virtualization', 'arch', 'usagePct'
)
Test-StrField 'cpu.brand' $j.cpu.brand $false
Test-StrField 'cpu.vendor' $j.cpu.vendor
Test-NumField 'cpu.physicalCores' $j.cpu.physicalCores $true 1 1024
Test-NumField 'cpu.logicalCores' $j.cpu.logicalCores $true 1 4096
Test-NumField 'cpu.baseMhz' $j.cpu.baseMhz $true 1 100000
Test-NumField 'cpu.maxMhz' $j.cpu.maxMhz $true 1 100000
Test-NumField 'cpu.currentMhz' $j.cpu.currentMhz $true 1 100000
Test-NumField 'cpu.l2Bytes' $j.cpu.l2Bytes $true 1 1e12
Test-NumField 'cpu.l3Bytes' $j.cpu.l3Bytes $true 1 1e12
Test-StrField 'cpu.socket' $j.cpu.socket
Test-BoolField 'cpu.virtualization' $j.cpu.virtualization
Test-ArrField 'cpu.instructions' $j.cpu.instructions
foreach ($ins in @($j.cpu.instructions)) { Check 'cpu.instructions entry is string' (Test-Str $ins) ([string]$ins) }
Test-StrField 'cpu.arch' $j.cpu.arch
Test-NumField 'cpu.usagePct' $j.cpu.usagePct $true 0 100

# ---- memory ----
Test-Section 'memory' $j.memory @('totalBytes', 'availableBytes', 'usedBytes', 'usedPct', 'modules', 'dualChannelHint') @('dualChannelHint')
Test-NumField 'memory.totalBytes' $j.memory.totalBytes $false 1 1e14
Test-NumField 'memory.availableBytes' $j.memory.availableBytes $false 0 1e14
Test-NumField 'memory.usedBytes' $j.memory.usedBytes $false 0 1e14
Test-NumField 'memory.usedPct' $j.memory.usedPct $false 0 100
Test-ArrField 'memory.modules' $j.memory.modules
Test-BoolField 'memory.dualChannelHint' $j.memory.dualChannelHint
foreach ($m in @($j.memory.modules)) {
    Test-Section 'memory.modules[]' $m @(
        'slot', 'manufacturer', 'partNumber', 'serial', 'capacityBytes', 'ratedMhz',
        'speedMhz', 'type', 'formFactor', 'voltageMv'
    ) @('slot', 'manufacturer', 'partNumber', 'serial', 'ratedMhz', 'speedMhz', 'type', 'formFactor', 'voltageMv')
    Test-NumField 'memory.modules[].capacityBytes' $m.capacityBytes $true 1 1e13
}

# ---- gpus ----
Test-ArrField 'gpus' $j.gpus
Check 'gpus is non-empty' (@($j.gpus).Count -gt 0) 'empty'
foreach ($gpu in @($j.gpus)) {
    Test-Section 'gpus[]' $gpu @('name', 'vendor', 'vramBytes', 'driverVersion', 'driverDate', 'discrete', 'status') @('vendor', 'vramBytes', 'driverVersion', 'driverDate', 'discrete', 'status')
    Test-StrField 'gpus[].name' $gpu.name $false
    Test-StrField 'gpus[].vendor' $gpu.vendor
    Test-NumField 'gpus[].vramBytes' $gpu.vramBytes $true 1 1e13
    Test-StrField 'gpus[].driverVersion' $gpu.driverVersion
    Test-StrField 'gpus[].driverDate' $gpu.driverDate $true $true
    Test-BoolField 'gpus[].discrete' $gpu.discrete
}

# ---- displays ----
Test-ArrField 'displays' $j.displays
Check 'displays is non-empty' (@($j.displays).Count -gt 0) 'empty'
foreach ($disp in @($j.displays)) {
    Test-Section 'displays[]' $disp @('name', 'manufacturer', 'resolution', 'refreshHz', 'sizeInch', 'primary') @('name', 'manufacturer', 'resolution', 'refreshHz', 'sizeInch')
    Test-BoolField 'displays[].primary' $disp.primary $false
    if ($null -ne $disp.resolution) {
        Check 'displays[].resolution is WxH' ($disp.resolution -match '^\d+x\d+$') ([string]$disp.resolution)
    }
    Test-NumField 'displays[].refreshHz' $disp.refreshHz $true 1 1000
    Test-NumField 'displays[].sizeInch' $disp.sizeInch $true 1 200
}
Check 'exactly one primary display' (@(@($j.displays) | Where-Object { $_.primary -eq $true }).Count -eq 1) 'primary flag count'

# ---- disks ----
Test-ArrField 'disks' $j.disks
Check 'disks is non-empty' (@($j.disks).Count -gt 0) 'empty'
foreach ($disk in @($j.disks)) {
    Test-Section 'disks[]' $disk @(
        'model', 'vendor', 'serial', 'firmware', 'interfaceType', 'mediaType', 'totalBytes',
        'health', 'healthPct', 'temperatureC', 'powerOnHours', 'powerCycles', 'volumes'
    ) @('vendor', 'serial', 'firmware', 'interfaceType', 'mediaType', 'totalBytes', 'healthPct', 'temperatureC', 'powerOnHours', 'powerCycles')
    Test-StrField 'disks[].model' $disk.model $false
    Check 'disks[].health enum' ($disk.health -in @('healthy', 'warning', 'critical', 'unknown')) ([string]$disk.health)
    if ($null -ne $disk.mediaType) { Check 'disks[].mediaType enum' ($disk.mediaType -in @('SSD', 'HDD', 'eMMC', 'SCM')) ([string]$disk.mediaType) }
    Test-NumField 'disks[].healthPct' $disk.healthPct $true 0 100
    Test-ArrField 'disks[].volumes' $disk.volumes
    foreach ($vol in @($disk.volumes)) {
        Test-Section 'disks[].volumes[]' $vol @('drive', 'label', 'fs', 'totalBytes', 'freeBytes') @('label', 'fs')
        Check 'volume.drive is "C:" style' ($vol.drive -match '^[A-Z]:$') ([string]$vol.drive)
        Test-NumField 'volume.totalBytes' $vol.totalBytes $false 0 1e14
        Test-NumField 'volume.freeBytes' $vol.freeBytes $false 0 1e14
    }
}

# ---- network ----
Test-Section 'network' $j.network @('adapters', 'internet', 'latencyMs', 'dnsOk') @('internet', 'latencyMs', 'dnsOk')
Test-ArrField 'network.adapters' $j.network.adapters
Check 'network.adapters is non-empty' (@($j.network.adapters).Count -gt 0) 'empty'
Test-BoolField 'network.internet' $j.network.internet
Test-NumField 'network.latencyMs' $j.network.latencyMs $true 0 60000
Test-BoolField 'network.dnsOk' $j.network.dnsOk
foreach ($ad in @($j.network.adapters)) {
    Test-Section 'network.adapters[]' $ad @(
        'name', 'type', 'mac', 'ipv4', 'ipv6', 'gateway', 'dns', 'speedMbps', 'connected', 'ssid', 'signalPct'
    ) @('mac', 'ipv4', 'ipv6', 'gateway', 'speedMbps', 'ssid', 'signalPct')
    Test-StrField 'network.adapters[].name' $ad.name $false
    Check 'adapter.type enum' ($ad.type -eq 'WLAN' -or $ad.type -eq $TypeEthernet -or $ad.type -eq $TypeOther) ([string]$ad.type)
    Test-ArrField 'network.adapters[].dns' $ad.dns
    Test-BoolField 'network.adapters[].connected' $ad.connected $false
    Test-NumField 'network.adapters[].speedMbps' $ad.speedMbps $true 0 1e7
    Test-NumField 'network.adapters[].signalPct' $ad.signalPct $true 0 100
}

# ---- runtime ----
Test-Section 'runtime' $j.runtime @(
    'dotnetFramework', 'dotnetRuntimes', 'vcpp', 'directx', 'webview2',
    'java', 'node', 'python', 'git', 'wsl', 'powershellVersion'
)
Test-ArrField 'runtime.dotnetFramework' $j.runtime.dotnetFramework
foreach ($fx in @($j.runtime.dotnetFramework)) {
    Test-Section 'runtime.dotnetFramework[]' $fx @('version', 'release', 'installed')
    Test-StrField 'runtime.dotnetFramework[].version' $fx.version $false
    Test-NumField 'runtime.dotnetFramework[].release' $fx.release $true 0 1e9
    Test-BoolField 'runtime.dotnetFramework[].installed' $fx.installed $false
}
Test-ArrField 'runtime.dotnetRuntimes' $j.runtime.dotnetRuntimes
foreach ($dr in @($j.runtime.dotnetRuntimes)) {
    Test-Section 'runtime.dotnetRuntimes[]' $dr @('name', 'version')
    Test-StrField 'runtime.dotnetRuntimes[].name' $dr.name $false
    Test-StrField 'runtime.dotnetRuntimes[].version' $dr.version $false
}
Test-ArrField 'runtime.vcpp' $j.runtime.vcpp
foreach ($vc in @($j.runtime.vcpp)) {
    Test-Section 'runtime.vcpp[]' $vc @('year', 'arch', 'version')
    Test-StrField 'runtime.vcpp[].year' $vc.year $false
    Check 'vcpp[].arch enum' ($vc.arch -in @('x64', 'x86', 'arm64')) ([string]$vc.arch)
    Test-StrField 'runtime.vcpp[].version' $vc.version $false
}
Test-Section 'runtime.directx' $j.runtime.directx @('version', 'major', 'd3d12', 'wddm', 'featureLevel') @('version', 'major', 'd3d12', 'wddm', 'featureLevel')
Test-StrField 'runtime.directx.version' $j.runtime.directx.version
Test-NumField 'runtime.directx.major' $j.runtime.directx.major $true 9 12
Test-BoolField 'runtime.directx.d3d12' $j.runtime.directx.d3d12
Test-StrField 'runtime.directx.wddm' $j.runtime.directx.wddm
Test-StrField 'runtime.directx.featureLevel' $j.runtime.directx.featureLevel
Test-Section 'runtime.webview2' $j.runtime.webview2 @('installed', 'version') @('version')
Test-BoolField 'runtime.webview2.installed' $j.runtime.webview2.installed
Test-StrField 'runtime.webview2.version' $j.runtime.webview2.version
Test-ArrField 'runtime.java' $j.runtime.java
foreach ($tool in @($j.runtime.java)) {
    Test-Section 'runtime.java[]' $tool @('name', 'version', 'path', 'source') @('version', 'path', 'source')
    Test-StrField 'runtime.java[].name' $tool.name $false
    if ($null -ne $tool.source) { Check 'java[].source enum' ($tool.source -in @('path', 'registry', 'dir')) ([string]$tool.source) }
}
foreach ($toolName in @('node', 'python', 'git')) {
    $tool = $j.runtime.$toolName
    if ($null -eq $tool) { continue }
    Test-Section ('runtime.' + $toolName) $tool @('name', 'version', 'path', 'source') @('version', 'path', 'source')
    Test-StrField ('runtime.' + $toolName + '.name') $tool.name $false
    if ($null -ne $tool.source) { Check ($toolName + '.source enum') ($tool.source -in @('path', 'registry', 'dir')) ([string]$tool.source) }
}
Test-Section 'runtime.wsl' $j.runtime.wsl @('installed', 'version', 'distros') @('installed', 'version')
Test-BoolField 'runtime.wsl.installed' $j.runtime.wsl.installed
Test-StrField 'runtime.wsl.version' $j.runtime.wsl.version
Test-ArrField 'runtime.wsl.distros' $j.runtime.wsl.distros
Test-StrField 'runtime.powershellVersion' $j.runtime.powershellVersion $false

# ---- security ----
Test-Section 'security' $j.security @('defenderRealtime', 'antivirus', 'firewall', 'secureBoot', 'tpm', 'uac') @('defenderRealtime', 'firewall', 'secureBoot', 'tpm', 'uac')
Test-BoolField 'security.defenderRealtime' $j.security.defenderRealtime
Test-ArrField 'security.antivirus' $j.security.antivirus
Test-StrField 'security.firewall' $j.security.firewall
Test-BoolField 'security.secureBoot' $j.security.secureBoot
Test-StrField 'security.tpm' $j.security.tpm
Test-StrField 'security.uac' $j.security.uac

# ---- compat ----
Test-Section 'compat' $j.compat @('verdict', 'passCount', 'warnCount', 'failCount', 'unknownCount', 'items')
Check 'compat.verdict enum' ($j.compat.verdict -in @('ok', 'warn', 'blocked')) ([string]$j.compat.verdict)
Test-ArrField 'compat.items' $j.compat.items
Check 'compat.items >= 11' (@($j.compat.items).Count -ge 11) ([string]@($j.compat.items).Count)
$statusCounts = @{ pass = 0; warn = 0; fail = 0; unknown = 0 }
$seenIds = @{}
foreach ($ci in @($j.compat.items)) {
    Test-Section 'compat.items[]' $ci @('id', 'name', 'status', 'actual', 'requirement', 'reason', 'detail') @('reason', 'detail')
    Test-StrField 'compat.items[].id' $ci.id $false
    Test-StrField 'compat.items[].name' $ci.name $false
    Check 'compat.items[].status enum' ($ci.status -in @('pass', 'warn', 'fail', 'unknown')) ([string]$ci.status)
    Test-StrField 'compat.items[].actual' $ci.actual $false
    Test-StrField 'compat.items[].requirement' $ci.requirement $false
    if ($null -ne $ci.reason) { Test-StrField 'compat.items[].reason' $ci.reason $true }
    if ($null -ne $ci.detail) { Test-StrField 'compat.items[].detail' $ci.detail $true }
    if ($ci.status -ne 'pass') {
        Check ('compat item "' + $ci.id + '" has a reason') ($null -ne $ci.reason -and ([string]$ci.reason).Length -gt 0) 'reason is null for non-pass item'
    }
    if ($seenIds.ContainsKey([string]$ci.id)) { Check ('compat item id unique: ' + $ci.id) $false 'duplicate id' } else { $seenIds[[string]$ci.id] = $true }
    if ($statusCounts.ContainsKey([string]$ci.status)) { $statusCounts[[string]$ci.status] = $statusCounts[[string]$ci.status] + 1 }
}
Check 'compat.passCount matches items' ($j.compat.passCount -eq $statusCounts['pass']) ([string]$j.compat.passCount + ' vs ' + $statusCounts['pass'])
Check 'compat.warnCount matches items' ($j.compat.warnCount -eq $statusCounts['warn']) ([string]$j.compat.warnCount + ' vs ' + $statusCounts['warn'])
Check 'compat.failCount matches items' ($j.compat.failCount -eq $statusCounts['fail']) ([string]$j.compat.failCount + ' vs ' + $statusCounts['fail'])
Check 'compat.unknownCount matches items' ($j.compat.unknownCount -eq $statusCounts['unknown']) ([string]$j.compat.unknownCount + ' vs ' + $statusCounts['unknown'])
$expectedVerdict = 'ok'
if ($statusCounts['fail'] -gt 0) { $expectedVerdict = 'blocked' } elseif ($statusCounts['warn'] -gt 0) { $expectedVerdict = 'warn' }
Check 'compat.verdict consistent with counts' ($j.compat.verdict -eq $expectedVerdict) ('expected ' + $expectedVerdict)

# ---- score ----
Test-Section 'score' $j.score @('total', 'level', 'parts')
Test-NumField 'score.total' $j.score.total $false 0 100
Check 'score.level enum' ($j.score.level -in @('excellent', 'good', 'fair', 'poor')) ([string]$j.score.level)
Test-ArrField 'score.parts' $j.score.parts
Check 'score.parts has 5 entries' (@($j.score.parts).Count -eq 5) ([string]@($j.score.parts).Count)
$weightSum = 0.0
$partKeys = @()
foreach ($part in @($j.score.parts)) {
    Test-Section 'score.parts[]' $part @('key', 'label', 'score', 'weight', 'note')
    Check 'score.parts[].key enum' ($part.key -in @('cpu', 'memory', 'storage', 'gpu', 'system')) ([string]$part.key)
    Test-StrField 'score.parts[].label' $part.label $false
    Test-NumField 'score.parts[].score' $part.score $false 0 100
    Test-NumField 'score.parts[].weight' $part.weight $false 0 1
    Test-StrField 'score.parts[].note' $part.note $false
    $weightSum += [double]$part.weight
    $partKeys += [string]$part.key
}
Check 'score weights sum to 1' ([Math]::Abs($weightSum - 1.0) -lt 0.001) ([string]$weightSum)
Check 'score part keys unique' (@($partKeys | Sort-Object -Unique).Count -eq 5) ($partKeys -join ',')
$expectedLevel = 'poor'
if ($j.score.total -ge 90) { $expectedLevel = 'excellent' }
elseif ($j.score.total -ge 80) { $expectedLevel = 'good' }
elseif ($j.score.total -ge 60) { $expectedLevel = 'fair' }
Check 'score.level consistent with total' ($j.score.level -eq $expectedLevel) ('expected ' + $expectedLevel)
$weighted = 0.0
foreach ($part in @($j.score.parts)) { $weighted += ([double]$part.score * [double]$part.weight) }
Check 'score.total equals weighted sum' ([Math]::Abs([double]$j.score.total - [Math]::Round($weighted)) -le 1) ([string]$j.score.total + ' vs ' + [string][Math]::Round($weighted))

# ---- summary ----
Write-Host ''
Write-Host ('== summary: ' + $script:PassCount + ' passed, ' + $script:FailCount + ' failed')
if ($script:FailCount -gt 0) {
    Write-Host '-- failures:'
    foreach ($f in $script:Failures) { Write-Host ('   - ' + $f) }
    exit 1
}
Write-Host '== ALL CHECKS PASSED'
exit 0
