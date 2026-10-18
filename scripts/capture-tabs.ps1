<#
.SYNOPSIS
  真机四页签自动验收：启动 exe → 扫描完成 → 依次点击「体检/环境/兼容/监控」→ 每页截一张图。

.DESCRIPTION
  为什么不用浏览器截图：浏览器里是 mock 数据，只有这个脚本验的是「e2e 真实链路」
  —— Tauri 外壳 + WebView2 渲染 + PowerShell 采集 + Rust 反序列化 + 前端渲染。

  坐标按 1180×800 的 CSS 逻辑像素写死，运行时用「客户区物理尺寸 / 1180」算出缩放系数，
  所以 100% / 125% / 150% 缩放都能点准。

.PARAMETER Exe
  exe 路径，默认取 release\ 下最新

.PARAMETER OutDir
  截图输出目录，默认 dev\tabs

.PARAMETER ScanWait
  启动后等扫描完成的秒数，默认 14
#>
param(
  [string]$Exe,
  [string]$OutDir,
  [int]$ScanWait = 14
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $Exe) {
  $c = Get-ChildItem (Join-Path $root 'release') -Filter '*.exe' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  if (-not $c) {
    $c = Get-ChildItem (Join-Path $root 'src-tauri\target\release') -Filter '*.exe' -File -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending
  }
  if (-not $c) { throw '没找到 exe' }
  $Exe = $c[0].FullName
}
if (-not $OutDir) { $OutDir = Join-Path $root 'dev\tabs' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class TabCap {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int value);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
}
"@

try { [void][TabCap]::SetProcessDPIAware() } catch { try { [void][TabCap]::SetProcessDpiAwareness(2) } catch { } }

# 逻辑坐标（对应 1180×800 的客户区）—— 页签中心点 + 截图区域
$tabs = @(
  @{ key = 'dashboard'; label = '体检'; x = 88;  y = 76 }
  @{ key = 'runtime';   label = '环境'; x = 165; y = 76 }
  @{ key = 'compat';    label = '兼容'; x = 240; y = 76 }
  @{ key = 'monitor';   label = '监控'; x = 315; y = 76 }
)
$LOGICAL_W = 1180

Write-Host "启动：$Exe" -ForegroundColor Magenta
$proc = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds $ScanWait
$proc.Refresh()
if ($proc.HasExited) { throw "进程已退出（$($proc.ExitCode)），界面没起来" }

$hwnd = $proc.MainWindowHandle
if ($hwnd -eq [IntPtr]::Zero) { throw '拿不到主窗口句柄' }
[TabCap]::ShowWindow($hwnd, 9) | Out-Null
[TabCap]::SetForegroundWindow($hwnd) | Out-Null
Start-Sleep -Milliseconds 800

# 客户区几何：客户区左上角（屏幕坐标）+ 物理尺寸
$cr = New-Object TabCap+RECT
[TabCap]::GetClientRect($hwnd, [ref]$cr) | Out-Null
$cw = $cr.Right - $cr.Left
$ch = $cr.Bottom - $cr.Top
$origin = New-Object TabCap+POINT
[TabCap]::ClientToScreen($hwnd, [ref]$origin) | Out-Null
$scale = $cw / $LOGICAL_W
Write-Host ("客户区 {0}x{1} 物理像素，缩放系数 {2:N3}（逻辑 1180x800）" -f $cw, $ch, $scale)

function Save-ClientShot([string]$path) {
  $bmp = New-Object System.Drawing.Bitmap $cw, $ch
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($origin.X, $origin.Y, 0, 0, (New-Object System.Drawing.Size $cw, $ch))
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

foreach ($t in $tabs) {
  # 点页签
  $px = [int]($origin.X + $t.x * $scale)
  $py = [int]($origin.Y + $t.y * $scale)
  [TabCap]::SetCursorPos($px, $py) | Out-Null
  Start-Sleep -Milliseconds 150
  [TabCap]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)   # LEFTDOWN
  Start-Sleep -Milliseconds 60
  [TabCap]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)   # LEFTUP

  # 监控页要多等几个采样点，曲线才有形状
  $wait = if ($t.key -eq 'monitor') { 5 } else { 2 }
  Start-Sleep -Seconds $wait

  $out = Join-Path $OutDir ("real-{0}.png" -f $t.key)
  Save-ClientShot $out
  Write-Host ("  已截图 {0}（{1}）-> {2}" -f $t.label, $t.key, $out) -ForegroundColor Green
}

Start-Sleep -Milliseconds 300
if (-not $proc.HasExited) {
  $proc.CloseMainWindow() | Out-Null
  Start-Sleep -Seconds 2
  if (-not $proc.HasExited) { $proc.Kill() }
}
Write-Host '已完成四页签真机截图并关闭进程' -ForegroundColor Green
