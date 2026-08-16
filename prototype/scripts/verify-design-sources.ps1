[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$WorkspaceRoot,

    [string]$ChatGPTFigmaPath,
    [string]$CodexSkillPath,
    [string]$AppleDesignSkillPath,
    [switch]$AllowMissingUserProvidedSources
)

$ErrorActionPreference = 'Stop'
$lockPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'design-sources.lock.json'
$lock = Get-Content -Raw -Encoding UTF8 -LiteralPath $lockPath | ConvertFrom-Json
$resolvedRoot = [System.IO.Path]::GetFullPath($WorkspaceRoot)

if (-not (Test-Path -LiteralPath $resolvedRoot -PathType Container)) {
    throw "WorkspaceRoot does not exist: $resolvedRoot"
}

function Get-DefaultUserPath {
    param([Parameter(Mandatory = $true)]$Source)
    return [Environment]::ExpandEnvironmentVariables(($Source.defaultPathTemplate -replace '/', '\'))
}

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

function Test-FileIdentity {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedSha256,
        [Parameter(Mandatory = $true)][bool]$CanBeMissing
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [ordered]@{
            id = $Id
            kind = 'user-provided'
            status = $(if ($CanBeMissing) { 'MISSING_ALLOWED' } else { 'MISSING' })
            path = $Path
            expected = $ExpectedSha256
            actual = $null
        }
    }

    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
    return [ordered]@{
        id = $Id
        kind = 'user-provided'
        status = $(if ($actual -eq $ExpectedSha256) { 'PASS' } else { 'HASH_MISMATCH' })
        path = $Path
        expected = $ExpectedSha256
        actual = $actual
    }
}

$results = [System.Collections.Generic.List[object]]::new()

foreach ($source in $lock.gitRepositories) {
    $target = Join-Path $resolvedRoot ($source.targetRelativePath -replace '/', '\')
    if (-not (Test-Path -LiteralPath $target -PathType Container)) {
        $results.Add([ordered]@{
            id = $source.id
            kind = 'git'
            status = 'MISSING'
            path = $target
            expected = $source.commit
            actual = $null
        })
        continue
    }

    $insideResult = Invoke-GitCapture -Arguments @('-C', $target, 'rev-parse', '--is-inside-work-tree')
    if ($insideResult.ExitCode -ne 0 -or ($insideResult.Output -join '').Trim() -ne 'true') {
        $results.Add([ordered]@{
            id = $source.id
            kind = 'git'
            status = 'NOT_A_GIT_REPOSITORY'
            path = $target
            expected = $source.commit
            actual = $null
        })
        continue
    }

    $headResult = Invoke-GitCapture -Arguments @('-C', $target, 'rev-parse', 'HEAD')
    $head = ($headResult.Output -join '').Trim()
    $results.Add([ordered]@{
        id = $source.id
        kind = 'git'
        status = $(if ($headResult.ExitCode -ne 0) { 'INCOMPLETE_CHECKOUT' } elseif ($head -eq $source.commit) { 'PASS' } else { 'COMMIT_MISMATCH' })
        path = $target
        expected = $source.commit
        actual = $head
    })
}

$figSource = $lock.userProvidedSources | Where-Object id -eq 'chatgpt-ui-kit-community-fig'
$figPath = if ($ChatGPTFigmaPath) { [System.IO.Path]::GetFullPath($ChatGPTFigmaPath) } else { Join-Path $resolvedRoot ($figSource.targetRelativePath -replace '/', '\') }
$results.Add((Test-FileIdentity -Id $figSource.id -Path $figPath -ExpectedSha256 $figSource.sha256 -CanBeMissing $AllowMissingUserProvidedSources.IsPresent))

$codexSource = $lock.userProvidedSources | Where-Object id -eq 'codex-skill'
$resolvedCodexPath = if ($CodexSkillPath) { [System.IO.Path]::GetFullPath($CodexSkillPath) } else { Get-DefaultUserPath $codexSource }
$results.Add((Test-FileIdentity -Id $codexSource.id -Path $resolvedCodexPath -ExpectedSha256 $codexSource.sha256 -CanBeMissing $AllowMissingUserProvidedSources.IsPresent))

$appleSource = $lock.userProvidedSources | Where-Object id -eq 'apple-design-skill'
$resolvedApplePath = if ($AppleDesignSkillPath) { [System.IO.Path]::GetFullPath($AppleDesignSkillPath) } else { Get-DefaultUserPath $appleSource }
$results.Add((Test-FileIdentity -Id $appleSource.id -Path $resolvedApplePath -ExpectedSha256 $appleSource.sha256 -CanBeMissing $AllowMissingUserProvidedSources.IsPresent))

$failed = @($results | Where-Object { $_.status -notin @('PASS', 'MISSING_ALLOWED') })
$report = [ordered]@{
    sourceSetId = $lock.sourceSetId
    workspaceRoot = $resolvedRoot
    valid = ($failed.Count -eq 0)
    results = $results
}

$report | ConvertTo-Json -Depth 8
if ($failed.Count -gt 0) {
    exit 1
}
