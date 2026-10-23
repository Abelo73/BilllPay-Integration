# Windows launcher for scripts/dev.sh (the stack runs inside WSL).
#   .\scripts\dev.ps1            start everything + checks
#   .\scripts\dev.ps1 check      checks only
#   .\scripts\dev.ps1 test       checks + smoke test
#   .\scripts\dev.ps1 stop       stop backend, frontend, ngrok
#   .\scripts\dev.ps1 logs backend
$root = Split-Path -Parent $PSScriptRoot
$wslRoot = (wsl -e wslpath -a ($root -replace '\\', '/')).Trim()
wsl -e bash -lc "cd '$wslRoot' && bash scripts/dev.sh $($args -join ' ')"
exit $LASTEXITCODE
