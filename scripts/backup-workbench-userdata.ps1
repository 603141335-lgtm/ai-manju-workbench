# Independent, non-destructive backup of existing DuduAI workbench user data.
# Run with the workbench closed. Downloads are not moved or deleted.
param(
  [string]$BackupRoot = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) '独独AI工作台-升级前备份')
)
$ErrorActionPreference = 'Stop'
$source = Join-Path $env:APPDATA 'DoubaoCreativeHubPublic'
if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw "找不到原工作台数据目录：$source。不会创建或修改任何工作台数据。"
}
if (Get-Process -Name '独独AI工作台' -ErrorAction SilentlyContinue) {
  throw '独独AI工作台正在运行。请先完全退出软件，再执行完整备份，避免复制到未写完的账号数据。'
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $BackupRoot ('完整数据-' + $stamp + '-' + [Guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Write-Host "正在只读复制原始工作台数据：$source"
Write-Host "备份位置：$destination"
& robocopy.exe $source $destination /E /XJ /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NP /NFL /NDL /NJH /NJS
$result = $LASTEXITCODE
if ($result -ge 8) {
  throw "数据复制出现错误（Robocopy 代码 $result）。原工作台数据没有被修改。请查看上方输出。"
}
foreach ($name in @('config.json','workspace.json','download-settings.json','license-device.bin','license-cache.bin')) {
  $before = Join-Path $source $name
  $after = Join-Path $destination $name
  if (Test-Path -LiteralPath $before -PathType Leaf) {
    if (-not (Test-Path -LiteralPath $after -PathType Leaf)) {
      throw "备份缺少文件 $name，原数据没有被修改。"
    }
    $originalHash = (Get-FileHash -LiteralPath $before -Algorithm SHA256).Hash
    $backupHash = (Get-FileHash -LiteralPath $after -Algorithm SHA256).Hash
    if ($originalHash -ne $backupHash) {
      throw "备份文件校验不一致：$name。原数据没有被修改。"
    }
  }
}
$note = @(
  '独独AI工作台升级备份',
  "备份日期：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "原数据目录：$source",
  "备份目录：$destination",
  '已完整复制原工作台 userData 目录（账号会话、项目、历史和授权缓存）。',
  '注意：外部下载目录和参考图文件夹可能位于本目录之外，未在本次备份内复制。',
  '此备份可能包含登录凭证，不要上传网盘、GitHub 或分享给他人。',
  '旧版仍可使用。只有新安装包通过实际测试后，才进行覆盖安装。'
)
$note | Set-Content -LiteralPath (Join-Path $destination '备份说明.txt') -Encoding UTF8
Write-Host ''
Write-Host '备份完成。原软件文件及数据未改变。' -ForegroundColor Green
Write-Host $destination
