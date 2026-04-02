# Find directories named ".ts" (TagSpaces); list or Recycle Bin.
# -Recycle -MaxItems N: only fetches N paths from Everything (not the whole index) - that was the slowness.
#
# Examples:
#   .\recycle-tagspaces-ts-folders.ps1 -UseEverything
#   .\recycle-tagspaces-ts-folders.ps1 -UseEverything -ListLimit 2000   # list at most 2000 (scan is heavy if unlimited)
#   .\recycle-tagspaces-ts-folders.ps1 -Recycle -MaxItems 1000 -UseEverything

[CmdletBinding()]
param(
    [string] $Root = $env:USERPROFILE,
    [switch] $Recycle,
    [ValidateRange(1, [int]::MaxValue)]
    [int] $MaxItems = 0,
    [switch] $UseEverything,
    [string] $EverythingUrl = 'http://127.0.0.1:8080',
    [string] $EverythingUser = '',
    [string] $EverythingPassword = '',
    # Scan mode only: max paths to pull from Everything / walk (0 = all - can be huge + slow JSON)
    [int] $ListLimit = 0
)

function Build-TagspacesDotTsSearch([string] $RootPath) {
    $r = $RootPath.TrimEnd('/', '\') + '\'
    $quoted = '"' + ($r -replace '"', '') + '"'
    "$quoted folder: exact:.ts"
}

function Get-FullPathFromEverythingRow($row) {
    $name = [string]$row.name
    $dir = [string]$row.path
    $name = $name.Trim()
    $dir = $dir.TrimEnd('/', '\')
    if (-not $name) { return $dir }
    if (-not $dir) { return $name }
    $sep = $(if ($dir -match '/') { '/' } else { '\' })
    $endsWith =
        $dir.Length -ge $name.Length -and
        $dir.Substring($dir.Length - $name.Length).Equals($name, [System.StringComparison]::OrdinalIgnoreCase) -and
        ($dir.Length -eq $name.Length -or $dir[$dir.Length - $name.Length - 1] -eq [char]'/' -or $dir[$dir.Length - $name.Length - 1] -eq [char]'\')
    if ($endsWith) { return $dir }
    return $dir + $sep + $name
}

function Get-EverythingRowsFromJson($data) {
    if ($null -eq $data) { return @() }
    if ($data -is [System.Array]) { return $data }
    if ($data.PSObject.Properties['results'] -and $data.results) { return @($data.results) }
    $pn = @($data.PSObject.Properties | ForEach-Object Name)
    if ($pn -contains 'name' -or $pn -contains 'path') { return , $data }
    return @()
}

# TotalLimit 0 = keep paging until empty. Else stop after that many paths (fast for -Recycle).
# Lightweight JSON: path only (smaller payload than size/date/attributes columns).
function Get-PathsViaEverythingHttp {
    param(
        [string] $BaseUrl,
        [string] $SearchText,
        [string] $HttpUser,
        [string] $HttpPass,
        [int] $TotalLimit = 0
    )
    $pageSize = 5000
    $offset = 0
    $all = [System.Collections.Generic.List[string]]::new()
    $headers = @{}
    if ($HttpUser) {
        $pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${HttpUser}:${HttpPass}"))
        $headers['Authorization'] = "Basic $pair"
    }
    $capped = $false
    do {
        $want = $pageSize
        if ($TotalLimit -gt 0) {
            $want = [Math]::Min($pageSize, $TotalLimit - $all.Count)
            if ($want -le 0) { break }
        }
        $qs = [System.Text.StringBuilder]::new()
        [void]$qs.Append("search=").Append([uri]::EscapeDataString($SearchText))
        [void]$qs.Append("&json=1&path_column=1&count=$want&offset=$offset&sort=path&ascending=1")
        $uri = ($BaseUrl.TrimEnd('/') + '/?' + $qs.ToString())
        try {
            $data = Invoke-RestMethod -Uri $uri -Headers $headers -Method Get -TimeoutSec 120
        }
        catch {
            throw "Everything HTTP failed (${uri}): $($_.Exception.Message). Enable HTTP server; set -EverythingUrl."
        }
        $rows = Get-EverythingRowsFromJson $data
        if ($rows.Count -eq 0) { break }
        foreach ($row in $rows) {
            $fp = Get-FullPathFromEverythingRow $row
            if ($fp) {
                $all.Add($fp)
                if ($TotalLimit -gt 0 -and $all.Count -ge $TotalLimit) { $capped = $true; break }
            }
        }
        if ($capped) { break }
        $offset += $rows.Count
        if ($TotalLimit -le 0 -and $rows.Count -lt $pageSize) { break }
        if ($TotalLimit -gt 0 -and $all.Count -ge $TotalLimit) { break }
    } while ($true)

    return [pscustomobject]@{ Paths = $all.ToArray(); Capped = ($TotalLimit -gt 0 -and $all.Count -ge $TotalLimit) }
}

function Resolve-EsExe {
    $c = Get-Command es.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    foreach ($p in @(
        "${env:ProgramFiles}\Everything\es.exe",
        "${env:ProgramFiles(x86)}\Everything\es.exe"
    )) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    return $null
}

# Stop after $Cap ".ts" dirs (Recycle or scan with -ListLimit); avoids listing the whole tree.
function Get-DotTsPathsLimitedWalk([string] $RootPath, [int] $Cap) {
    $list = [System.Collections.Generic.List[string]]::new()
    if (-not (Test-Path -LiteralPath $RootPath)) {
        return [pscustomobject]@{ Paths = [string[]]@(); Capped = $false }
    }
    $rootFull = (Resolve-Path -LiteralPath $RootPath).Path
    $stack = [System.Collections.Generic.Stack[string]]::new()
    $stack.Push($rootFull)
    $hitCap = $false
    while ($stack.Count -gt 0 -and -not $hitCap) {
        $dir = $stack.Pop()
        try {
            foreach ($sub in [System.IO.Directory]::EnumerateDirectories($dir)) {
                if ([System.IO.Path]::GetFileName($sub) -eq '.ts') {
                    $list.Add($sub)
                    if ($list.Count -ge $Cap) { $hitCap = $true; break }
                }
                if (-not $hitCap) { $stack.Push($sub) } # recurse into all subdirs (incl. .ts) until cap
            }
        }
        catch {
            # skip inaccessible
        }
    }
    return [pscustomobject]@{ Paths = $list.ToArray(); Capped = ($list.Count -ge $Cap) }
}

# --- Recycle needs MaxItems before we query Everything (so we only request N rows, not millions)
if ($Recycle -and $MaxItems -lt 1) {
    Write-Error "With -Recycle you must set -MaxItems."
    exit 1
}

$fetchCap = 0
if ($Recycle) {
    $fetchCap = $MaxItems
}
elseif ($ListLimit -gt 0) {
    $fetchCap = $ListLimit
}

Write-Host "Scanning under: $Root" -ForegroundColor Cyan
if ($fetchCap -gt 0) {
    Write-Host "(fetch cap: $fetchCap - avoids loading every match)" -ForegroundColor DarkGray
}

$discoveryCapped = $false
[string[]] $paths = @()

if ($UseEverything) {
    $searchText = Build-TagspacesDotTsSearch $Root
    $es = Resolve-EsExe
    if ($es) {
        Write-Host "Using es.exe: $es" -ForegroundColor DarkGray
        # -n = max results (voidtools CLI); only ask index for what we need
        if ($fetchCap -gt 0) {
            $paths = @(& $es -n $fetchCap $searchText 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ })
            $discoveryCapped = ($paths.Count -ge $fetchCap)
        }
        else {
            $paths = @(& $es $searchText 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ })
        }
    }
    else {
        Write-Host "Everything HTTP: $EverythingUrl" -ForegroundColor DarkGray
        $r = Get-PathsViaEverythingHttp -BaseUrl $EverythingUrl -SearchText $searchText `
            -HttpUser $EverythingUser.Trim() -HttpPass $EverythingPassword -TotalLimit $fetchCap
        $paths = $r.Paths
        $discoveryCapped = $r.Capped
    }
}
else {
    $enumOptType = 'System.IO.EnumerationOptions' -as [type]
    if ($fetchCap -gt 0) {
        $r = Get-DotTsPathsLimitedWalk -RootPath $Root -Cap $fetchCap
        $paths = $r.Paths
        $discoveryCapped = $r.Capped
    }
    elseif ($enumOptType) {
        $eo = [System.IO.EnumerationOptions]::new()
        $eo.RecurseSubdirectories = $true
        $eo.IgnoreInaccessible = $true
        $eo.AttributesToSkip = [System.IO.FileAttributes]::ReparsePoint
        $paths = @([System.IO.Directory]::EnumerateDirectories($Root, '.ts', $eo))
    }
    else {
        try {
            $paths = @([System.IO.Directory]::EnumerateDirectories($Root, '.ts', [System.IO.SearchOption]::AllDirectories))
        }
        catch {
            Write-Error "EnumerateDirectories failed: $($_.Exception.Message). Try PS 7, -UseEverything, or narrow -Root."
            exit 1
        }
    }
}

$count = $paths.Count
$capMsg = if ($discoveryCapped) { ' (stopped at cap - there may be more)' } else { '' }
Write-Host "Found $count folder(s) named '.ts'$capMsg" -ForegroundColor $(if ($count) { 'Yellow' } else { 'Green' })
if ($count -eq 0) { exit 0 }

if (-not $Recycle) {
    $paths | ForEach-Object { Write-Host $_ }
    Write-Host "`nScan only. Large trees: -ListLimit N. Recycle: -Recycle -MaxItems N." -ForegroundColor Cyan
    exit 0
}

Add-Type -AssemblyName Microsoft.VisualBasic

$batch = $paths
$n = 0
foreach ($full in $batch) {
    $n++
    Write-Host "[$n/$($batch.Count)] Recycle: $full"
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
        $full,
        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
    )
}

$tail = if ($discoveryCapped) {
    'Cap hit - run again to recycle another batch.'
}
else {
    'Done.'
}
Write-Host "`n$tail Recycled $($batch.Count) folder(s)." -ForegroundColor Green
