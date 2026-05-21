# git-sync.ps1 — stage, commit, and push changes inside the "image generation" folder.
#
# Usage:
#   .\scripts\git-sync.ps1 "your commit message"
#
# Run from anywhere — the script resolves the folder it lives in. It stages only
# files under the "image generation" folder, so sibling folders in the repo are
# never touched. Heavy/secret files are kept out by .gitignore.
param([string]$Message = "Update image generation")
$ErrorActionPreference = "Stop"

# The "image generation" folder = the parent of this scripts/ directory.
$FolderDir = Split-Path -Parent $PSScriptRoot
Set-Location $FolderDir

git add .

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "Nothing to commit — working tree clean."
    exit 0
}

Write-Host "Staged changes:"
git diff --cached --stat

git commit -m $Message
git push
Write-Host "OK Pushed: $Message"
