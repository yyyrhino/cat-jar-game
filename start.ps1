$ErrorActionPreference = 'Stop'
$siteUrl = 'http://127.0.0.1:4180'
$running = $false
$existingPage = $null
try { $existingPage = Invoke-WebRequest -UseBasicParsing -Uri $siteUrl -TimeoutSec 2 } catch { }
if ($existingPage) {
    if ($existingPage.Content -notmatch '<title>猫猫罐</title>') { throw '4180 端口正在被另一个程序使用，请关闭该程序后再打开猫猫罐。' }
    $running = $true
}
if (-not $running) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) { $nodeExecutable = $nodeCommand.Source }
    else { $nodeExecutable = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
    if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw '需要 Node.js 才能启动本地网页。' }
    Start-Process -FilePath $nodeExecutable -ArgumentList 'server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 100
        try { $running = (Invoke-WebRequest -UseBasicParsing -Uri $siteUrl -TimeoutSec 1).Content -match '<title>猫猫罐</title>'; if ($running) { break } } catch { }
    }
    if (-not $running) { throw '猫猫罐没有成功启动，请确认 4180 端口未被占用。' }
}
Start-Process $siteUrl
