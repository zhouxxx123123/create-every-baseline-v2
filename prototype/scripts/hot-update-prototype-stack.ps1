[CmdletBinding()]
param(
    [string]$WorkspaceRoot = (Get-Location).Path,
    [string]$Repository = 'zhouxxx123123/create-every-baseline-v2',
    [string]$Ref = 'main',
    [string]$PrototypeSkillRoot = (Join-Path $env:USERPROFILE '.agents\skills\prototype'),
    [string]$CodexSkillRoot = (Join-Path $env:USERPROFILE '.codex\skills\codex'),
    [string]$AppleDesignSkillRoot = (Join-Path $env:USERPROFILE '.codex\skills\apple-design'),
    [string]$ChatGPTFigmaPath,
    [string]$SourceCacheRoot,
    [string]$SourceDirectory,
    [switch]$PlanOnly
)

$ErrorActionPreference = 'Stop'
$resolvedWorkspace = [System.IO.Path]::GetFullPath($WorkspaceRoot)
$resolvedPrototype = [System.IO.Path]::GetFullPath($PrototypeSkillRoot)
$resolvedCodex = [System.IO.Path]::GetFullPath($CodexSkillRoot)
$resolvedApple = [System.IO.Path]::GetFullPath($AppleDesignSkillRoot)
$tempRoot = Join-Path $env:TEMP ("prototype-stack-update-{0}" -f [guid]::NewGuid().ToString('N'))
$packageRoot = $null
$installedTargets = [System.Collections.Generic.List[object]]::new()
$backupRoot = Join-Path $env:LOCALAPPDATA ("Codex\prototype-stack-backups\{0}" -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Assert-ExactFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Expected,
        [Parameter(Mandatory = $true)][string]$Label
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Missing bundled file for $Label`: $Path"
    }
    $actual = Get-Sha256 -Path $Path
    if ($actual -ne $Expected) {
        throw "Hash mismatch for $Label. Expected $Expected, found $actual"
    }
}

function Install-DirectorySafely {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Target,
        [Parameter(Mandatory = $true)][string]$BackupName
    )

    $targetParent = Split-Path -Parent $Target
    $incoming = Join-Path $targetParent (".{0}.incoming-{1}" -f (Split-Path -Leaf $Target), [guid]::NewGuid().ToString('N'))
    $backup = Join-Path $backupRoot $BackupName
    New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
    Copy-Item -LiteralPath $Source -Destination $incoming -Recurse

    $hadExisting = Test-Path -LiteralPath $Target
    if ($hadExisting) {
        Move-Item -LiteralPath $Target -Destination $backup
    }
    try {
        Move-Item -LiteralPath $incoming -Destination $Target
    } catch {
        if ($hadExisting -and (Test-Path -LiteralPath $backup) -and -not (Test-Path -LiteralPath $Target)) {
            Move-Item -LiteralPath $backup -Destination $Target
        }
        throw
    }

    $installedTargets.Add([pscustomobject]@{
        Target = $Target
        Backup = $backup
        HadExisting = $hadExisting
        Name = $BackupName
    })
}

function Restore-InstalledSkills {
    for ($index = $installedTargets.Count - 1; $index -ge 0; $index--) {
        $item = $installedTargets[$index]
        if (Test-Path -LiteralPath $item.Target) {
            $failed = Join-Path $backupRoot ("failed-{0}-{1}" -f $item.Name, [guid]::NewGuid().ToString('N'))
            Move-Item -LiteralPath $item.Target -Destination $failed
        }
        if ($item.HadExisting -and (Test-Path -LiteralPath $item.Backup)) {
            Move-Item -LiteralPath $item.Backup -Destination $item.Target
        }
    }
}

try {
    if (-not (Test-Path -LiteralPath $resolvedWorkspace -PathType Container)) {
        if ($PlanOnly) {
            Write-Output "PLAN create workspace: $resolvedWorkspace"
        } else {
            New-Item -ItemType Directory -Path $resolvedWorkspace -Force | Out-Null
        }
    }

    if ($SourceDirectory) {
        $packageRoot = [System.IO.Path]::GetFullPath($SourceDirectory)
        if (-not (Test-Path -LiteralPath $packageRoot -PathType Container)) {
            throw "SourceDirectory does not exist: $packageRoot"
        }
    } else {
        New-Item -ItemType Directory -Path $tempRoot | Out-Null
        $archive = Join-Path $tempRoot 'stack.zip'
        $escapedRef = [uri]::EscapeDataString($Ref)
        $archiveUrl = "https://codeload.github.com/$Repository/zip/$escapedRef"
        Write-Output "DOWNLOAD $Repository@$Ref"
        Invoke-WebRequest -UseBasicParsing -Uri $archiveUrl -OutFile $archive
        Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $tempRoot 'expanded')
        $candidate = Get-ChildItem -LiteralPath (Join-Path $tempRoot 'expanded') -Directory |
            Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'prototype\SKILL.md') -PathType Leaf } |
            Select-Object -First 1
        if (-not $candidate) {
            throw "Downloaded archive does not contain prototype/SKILL.md"
        }
        $packageRoot = $candidate.FullName
    }

    $sourcePrototype = Join-Path $packageRoot 'prototype'
    $lockPath = Join-Path $sourcePrototype 'design-sources.lock.json'
    if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
        throw "Package is missing prototype/design-sources.lock.json"
    }
    $lock = Get-Content -Raw -Encoding UTF8 -LiteralPath $lockPath | ConvertFrom-Json

    foreach ($skill in $lock.managedSkills) {
        $bundle = Join-Path $sourcePrototype ($skill.bundleRelativePath -replace '/', '\')
        foreach ($file in $skill.files) {
            Assert-ExactFile -Path (Join-Path $bundle ($file.path -replace '/', '\')) -Expected $file.sha256 -Label "$($skill.id):$($file.path)"
        }
    }

    $sourceCodex = Join-Path $sourcePrototype (($lock.managedSkills | Where-Object id -eq 'codex-skill').bundleRelativePath -replace '/', '\')
    $sourceApple = Join-Path $sourcePrototype (($lock.managedSkills | Where-Object id -eq 'apple-design-skill').bundleRelativePath -replace '/', '\')

    if ($PlanOnly) {
        Write-Output "PLAN install prototype -> $resolvedPrototype"
        Write-Output "PLAN install codex -> $resolvedCodex"
        Write-Output "PLAN install apple-design -> $resolvedApple"
        Write-Output "PLAN restore pinned component sources -> $resolvedWorkspace"
        Write-Output "PLAN ChatGPT UI Kit source: $($lock.userProvidedSources[0].acquisitionUrl)"
        exit 0
    }

    if (Test-Path -LiteralPath $backupRoot) {
        throw "Backup target already exists: $backupRoot"
    }
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

    Install-DirectorySafely -Source $sourceCodex -Target $resolvedCodex -BackupName 'codex'
    Install-DirectorySafely -Source $sourceApple -Target $resolvedApple -BackupName 'apple-design'
    Install-DirectorySafely -Source $sourcePrototype -Target $resolvedPrototype -BackupName 'prototype'

    $restoreScript = Join-Path $resolvedPrototype 'scripts\restore-design-sources.ps1'
    $restoreArgs = @{
        WorkspaceRoot = $resolvedWorkspace
        CodexSkillPath = $resolvedCodex
        AppleDesignSkillPath = $resolvedApple
    }
    if ($ChatGPTFigmaPath) { $restoreArgs.ChatGPTFigmaPath = $ChatGPTFigmaPath }
    if ($SourceCacheRoot) { $restoreArgs.SourceCacheRoot = $SourceCacheRoot }
    & $restoreScript @restoreArgs
    if ($LASTEXITCODE -ne 0) { throw 'Pinned component restoration or stack verification failed.' }

    $result = [ordered]@{
        valid = $true
        repository = $Repository
        ref = $Ref
        sourceSetId = $lock.sourceSetId
        workspaceRoot = $resolvedWorkspace
        prototypeSkillRoot = $resolvedPrototype
        codexSkillRoot = $resolvedCodex
        appleDesignSkillRoot = $resolvedApple
        chatGptFigmaSource = $lock.userProvidedSources[0].acquisitionUrl
        backupRoot = $backupRoot
    }
    $result | ConvertTo-Json -Depth 6
} catch {
    if ($installedTargets.Count -gt 0) {
        Restore-InstalledSkills
    }
    throw
} finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
