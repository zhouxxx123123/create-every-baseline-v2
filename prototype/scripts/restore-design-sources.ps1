[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$WorkspaceRoot,

    [string]$ChatGPTFigmaPath,
    [string]$CodexSkillPath,
    [string]$AppleDesignSkillPath,
    [string]$SourceCacheRoot,
    [switch]$AllowMissingUserProvidedSources,
    [switch]$PlanOnly
)

$ErrorActionPreference = 'Stop'
$skillRoot = Split-Path -Parent $PSScriptRoot
$lockPath = Join-Path $skillRoot 'design-sources.lock.json'
$verifyScript = Join-Path $PSScriptRoot 'verify-design-sources.ps1'
$lock = Get-Content -Raw -Encoding UTF8 -LiteralPath $lockPath | ConvertFrom-Json
$resolvedRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)
$resolvedCacheRoot = if ($SourceCacheRoot) { [System.IO.Path]::GetFullPath($SourceCacheRoot) } else { $null }

function Invoke-GitCapture {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        $output = & git @Arguments 2>$null
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    return [pscustomobject]@{ Output = @($output); ExitCode = $exitCode }
}

function Invoke-PinnedFetch {
    param(
        [Parameter(Mandatory = $true)][string]$Target,
        [Parameter(Mandatory = $true)][string]$SourceId,
        [Parameter(Mandatory = $true)][string]$Commit,
        [Parameter(Mandatory = $true)][string]$FetchSource
    )

    for ($attempt = 1; $attempt -le 3; $attempt++) {
        & git -c http.version=HTTP/1.1 -C $Target fetch --quiet --depth 1 $FetchSource $Commit
        if ($LASTEXITCODE -eq 0) {
            return
        }
        if ($attempt -lt 3) {
            Write-Warning "Fetch attempt $attempt failed for $SourceId; retrying the same pinned commit."
            Start-Sleep -Seconds $attempt
        }
    }
    throw "git fetch failed for $SourceId at $Commit after 3 attempts"
}

if ($resolvedCacheRoot -and -not (Test-Path -LiteralPath $resolvedCacheRoot -PathType Container)) {
    throw "SourceCacheRoot does not exist: $resolvedCacheRoot"
}

if (-not (Test-Path -LiteralPath $resolvedRoot)) {
    if ($PlanOnly) {
        Write-Output "PLAN create workspace root: $resolvedRoot"
    } else {
        New-Item -ItemType Directory -Path $resolvedRoot | Out-Null
    }
} elseif (-not (Test-Path -LiteralPath $resolvedRoot -PathType Container)) {
    throw "WorkspaceRoot is not a directory: $resolvedRoot"
}

foreach ($source in $lock.gitRepositories) {
    $target = Join-Path $resolvedRoot ($source.targetRelativePath -replace '/', '\')
    $cacheRepository = if ($resolvedCacheRoot) { Join-Path $resolvedCacheRoot ($source.targetRelativePath -replace '/', '\') } else { $null }
    if ($cacheRepository -and -not (Test-Path -LiteralPath $cacheRepository -PathType Container)) {
        throw "Source cache is missing $($source.id): $cacheRepository"
    }
    $fetchSource = if ($cacheRepository) { $cacheRepository } else { 'origin' }
    if ($PlanOnly) {
        Write-Output "PLAN restore $($source.id) at $($source.commit) from $fetchSource -> $target"
        continue
    }

    if (Test-Path -LiteralPath $target) {
        $insideResult = Invoke-GitCapture -Arguments @('-C', $target, 'rev-parse', '--is-inside-work-tree')
        if ($insideResult.ExitCode -ne 0 -or ($insideResult.Output -join '').Trim() -ne 'true') {
            throw "Refusing to overwrite non-Git path: $target"
        }

        $headResult = Invoke-GitCapture -Arguments @('-C', $target, 'rev-parse', 'HEAD')
        if ($headResult.ExitCode -eq 0) {
            $head = ($headResult.Output -join '').Trim()
            if ($head -ne $source.commit) {
                throw "Refusing to change existing $($source.id): expected $($source.commit), found $head"
            }
            Write-Output "PRESENT $($source.id) $head"
            continue
        }

        $originResult = Invoke-GitCapture -Arguments @('-C', $target, 'remote', 'get-url', 'origin')
        $origin = ($originResult.Output -join '').Trim()
        if ($originResult.ExitCode -ne 0 -or $origin -ne $source.repository) {
            throw "Refusing to resume incomplete repository with unexpected origin: $target"
        }
        Write-Output "RESUME $($source.id) $($source.commit)"
        Invoke-PinnedFetch -Target $target -SourceId $source.id -Commit $source.commit -FetchSource $fetchSource
        & git -C $target checkout --quiet --detach FETCH_HEAD
        if ($LASTEXITCODE -ne 0) { throw "git checkout failed for $($source.id)" }
        Write-Output "RESTORED $($source.id) $($source.commit)"
        continue
    }

    $parent = Split-Path -Parent $target
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    New-Item -ItemType Directory -Path $target | Out-Null
    & git -C $target init --quiet
    if ($LASTEXITCODE -ne 0) { throw "git init failed for $target" }
    & git -C $target remote add origin $source.repository
    if ($LASTEXITCODE -ne 0) { throw "git remote add failed for $($source.id)" }
    Invoke-PinnedFetch -Target $target -SourceId $source.id -Commit $source.commit -FetchSource $fetchSource
    & git -C $target checkout --quiet --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0) { throw "git checkout failed for $($source.id)" }
    Write-Output "RESTORED $($source.id) $($source.commit)"
}

if ($PlanOnly) {
    Write-Output 'PLAN user-provided sources are verified, never downloaded or redistributed.'
    exit 0
}

$verifyArgs = @{
    WorkspaceRoot = $resolvedRoot
    AllowMissingUserProvidedSources = $AllowMissingUserProvidedSources
}
if ($ChatGPTFigmaPath) {
    $verifyArgs.ChatGPTFigmaPath = $ChatGPTFigmaPath
}
if ($CodexSkillPath) {
    $verifyArgs.CodexSkillPath = $CodexSkillPath
}
if ($AppleDesignSkillPath) {
    $verifyArgs.AppleDesignSkillPath = $AppleDesignSkillPath
}

& $verifyScript @verifyArgs
if ($LASTEXITCODE -ne 0) {
    throw 'Design-source verification failed. Supply authorized user-provided sources and rerun.'
}
