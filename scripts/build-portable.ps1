<#
.SYNOPSIS
  构建「爱弥斯 · 环境检测」绿色版单文件 exe，并打包成可直接分发的 zip。

.DESCRIPTION
  1. 前端 tsc + vite build
  2. Rust release 构建（tauri build --no-bundle，不出安装器）
  3. 产物拷到 release/，重命名为「爱弥斯·环境检测.exe」
  4. 生成 SHA256 校验文件 + zip 压缩包

.PARAMETER Clean
  先清理 src-tauri/target 再构建（全量重编，慢）

.PARAMETER SkipBuild
  跳过构建，只做 release/ 收集与打包（调试流水线用）

.EXAMPLE
  pwsh -File scripts\build-portable.ps1
  pwsh -File scripts\build-portable.ps1 -Clean
#>
param(
  [switch]$Clean,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$exeName = '爱弥斯·环境检测.exe'
$releaseDir = Join-Path $root 'release'
$started = Get-Date

function Step($msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Magenta
}

Write-Host "爱弥斯 · 环境检测 —— 绿色版打包" -ForegroundColor Magenta
Write-Host "工程目录：$root"

# ---------------------------------------------------------------- 0. 环境
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
if (-not $SkipBuild) {
  if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "找不到 cargo。Rust 工具链没装？下载：https://rustup.rs"
  }
  if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    throw "找不到 node_modules，先跑 npm install"
  }
}

# ---------------------------------------------------------------- 1. 清理
if ($Clean -and (Test-Path (Join-Path $root 'src-tauri\target'))) {
  Step "清理 src-tauri\target（全量重编）"
  Remove-Item (Join-Path $root 'src-tauri\target') -Recurse -Force
}

# ---------------------------------------------------------------- 2. 构建
if (-not $SkipBuild) {
  Step "构建前端 + Rust（tauri build --no-bundle）"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  npm run app:build
  if ($LASTEXITCODE -ne 0) { throw "构建失败（退出码 $LASTEXITCODE）" }
  $sw.Stop()
  Write-Host ("构建完成，用时 {0:N1} 分钟" -f ($sw.Elapsed.TotalMinutes)) -ForegroundColor Green
}

# ---------------------------------------------------------------- 3. 收集 exe
Step "收集产物"
$targetDir = Join-Path $root 'src-tauri\target\release'
if (-not (Test-Path $targetDir)) { throw "找不到构建目录：$targetDir" }

$candidates = Get-ChildItem $targetDir -Filter '*.exe' -File |
  Where-Object { $_.Name -notmatch '(?i)(setup|uninst|nsis|wix|bundle)' } |
  Sort-Object LastWriteTime -Descending

if (-not $candidates) { throw "在 $targetDir 下没找到 exe 产物" }
$built = $candidates[0]
Write-Host "找到产物：$($built.FullName)"
Write-Host ("体积：{0:N2} MB" -f ($built.Length / 1MB))

# ---------------------------------------------------------------- 3b. 新鲜度守卫
# 为什么需要这段：-SkipBuild 只做「收集 + 打包」，完全不构建。
# 如果改完源码（前端 dist / Rust 源码 / 内嵌的 scan.ps1）只跑 -SkipBuild，
# 拿到的是上一次构建的旧 exe —— 改动会被静默丢弃，而且从体积上看不出任何异常。
# 这里断言 exe 比所有输入都新，否则直接失败，逼用户去掉 -SkipBuild。
$inputRoots = @(
  (Join-Path $root 'dist'),
  (Join-Path $root 'src'),
  (Join-Path $root 'src-tauri\src'),
  (Join-Path $root 'src-tauri\scripts'),
  (Join-Path $root 'src-tauri\tauri.conf.json'),
  (Join-Path $root 'src-tauri\Cargo.toml'),
  (Join-Path $root 'package.json')
)
$newestInput = $null
foreach ($item in $inputRoots) {
  if (-not (Test-Path -LiteralPath $item)) { continue }
  $files = if ((Get-Item -LiteralPath $item).PSIsContainer) {
    Get-ChildItem -LiteralPath $item -Recurse -File -ErrorAction SilentlyContinue
  } else {
    Get-Item -LiteralPath $item
  }
  foreach ($f in $files) {
    if ($null -eq $newestInput -or $f.LastWriteTime -gt $newestInput.LastWriteTime) {
      $newestInput = $f
    }
  }
}
if ($null -ne $newestInput -and $built.LastWriteTime -lt $newestInput.LastWriteTime) {
  $msg = @(
    "产物比源码旧，拒绝打包：",
    ("  exe     : {0}  ({1:yyyy-MM-dd HH:mm:ss})" -f $built.Name, $built.LastWriteTime),
    ("  最新输入: {0}  ({1:yyyy-MM-dd HH:mm:ss})" -f $newestInput.FullName.Replace($root + '\', ''), $newestInput.LastWriteTime),
    "请去掉 -SkipBuild 重新构建，否则会把旧代码打进去。"
  ) -join "`n"
  throw $msg
}
if ($SkipBuild) {
  Write-Host "新鲜度检查通过（-SkipBuild：产物不早于任何源码）" -ForegroundColor DarkGray
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$finalExe = Join-Path $releaseDir $exeName
Copy-Item $built.FullName $finalExe -Force

# ---------------------------------------------------------------- 4. 校验 + zip
Step "生成校验值与压缩包"
$hash = (Get-FileHash $finalExe -Algorithm SHA256).Hash
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$sizeMb = [math]::Round((Get-Item $finalExe).Length / 1MB, 2)

$readmeText = @"
爱弥斯 · 环境检测 v$version
制作 清吾 · https://qingwu.ink

【怎么用】
1. 把「$exeName」放到任意目录（桌面 / U 盘 / 移动硬盘都行）
2. 双击运行，不需要安装
3. 想要温度、硬盘 SMART、TPM 等深度数据，点界面上的「以管理员重启」

【系统要求】
- Windows 10 1809+ / Windows 11（64 位）
- 运行时依赖系统自带 WebView2（Win11 自带；Win10 一般已随 Edge 安装）

【绿色承诺】
- 不写注册表、不装服务、不进开机启动
- 不联网上传任何数据（外网探测那一项只做连通性 ping）

【文件校验】
SHA256: $hash
体积: $sizeMb MB
构建时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

【许可】
MIT © 清吾
"@
$readmePath = Join-Path $releaseDir '使用说明.txt'
[System.IO.File]::WriteAllText($readmePath, $readmeText, (New-Object System.Text.UTF8Encoding($true)))

$zipName = "爱弥斯环境检测-v$version-绿色版.zip"
$zipPath = Join-Path $releaseDir $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $finalExe, $readmePath -DestinationPath $zipPath -CompressionLevel Optimal

# ---------------------------------------------------------------- 5. 汇总
$elapsed = (Get-Date) - $started
Write-Host ""
Write-Host "================ 打包完成 ================" -ForegroundColor Green
Write-Host ("单文件 exe : {0}  ({1:N2} MB)" -f $finalExe, $sizeMb)
Write-Host ("压缩包     : {0}" -f $zipPath)
Write-Host ("SHA256     : {0}" -f $hash)
Write-Host ("总耗时     : {0:N1} 分钟" -f $elapsed.TotalMinutes)
Write-Host "=========================================" -ForegroundColor Green
