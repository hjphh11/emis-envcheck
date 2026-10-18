<#
.SYNOPSIS
  启动「爱弥斯 · 环境检测」exe，等窗口出来，截一张图，然后关掉。

.DESCRIPTION
  用于打包后的真机验收（浏览器 mock 截图不能替代真实 WebView2 渲染）。
  会把窗口提到前台，按窗口矩形截屏；如果拿不到窗口矩形就退回整屏截图。

.PARAMETER Exe
  exe 路径。默认取 release\ 下最新的 exe。

.PARAMETER Out
  截图输出路径，默认 dev\shot-app.png

.PARAMETER WaitSec
  启动后等待秒数（等扫描完），默认 7

.PARAMETER Keep
  截完不关闭进程

.EXAMPLE
  pwsh -File scripts\capture-app.ps1
  pwsh -File scripts\capture-app.ps1 -WaitSec 12 -Keep
#>
param(
  [string]$Exe,
  [string]$Out,
  [int]$WaitSec = 7,
  [switch]$Keep
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $Exe) {
  $cand = Get-ChildItem (Join-Path $root 'release') -Filter '*.exe' -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending
  if (-not $cand) {
    $cand = Get-ChildItem (Join-Path $root 'src-tauri\target\release') -Filter '*.exe' -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -notmatch '(?i)setup|uninst' } | Sort-Object LastWriteTime -Descending
  }
  if (-not $cand) { throw "没找到 exe，先跑 scripts\build-portable.ps1" }
  $Exe = $cand[0].FullName
}
if (-not $Out) { $Out = Join-Path $root 'dev\shot-app.png' }
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Cap {
  // 高 DPI 感知：不加这句，GetWindowRect 返回的是「虚拟化」坐标，
  // 而 CopyFromScreen 用的是物理像素，截图会整体偏移、右侧被裁掉（实测 125% 缩放下偏 133px）。
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] public static extern IntPtr GetThreadDpiAwarenessContext();
  [DllImport("shcore.dll")] public static extern int SetProcessDpiAwareness(int value);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
}
"@

# —— 先开高 DPI 感知，否则 GetWindowRect 与物理像素不一致，截图会偏 ——
$dpiOk = $false
try { $dpiOk = [Win32Cap]::SetProcessDPIAware() } catch { }
if (-not $dpiOk) { try { [void][Win32Cap]::SetProcessDpiAwareness(2) } catch { } }
Write-Host "高 DPI 感知：$dpiOk"

Write-Host "启动：$Exe" -ForegroundColor Magenta
$proc = Start-Process -FilePath $Exe -PassThru
Write-Host "PID=$($proc.Id)，等待 $WaitSec 秒让界面渲染完…"
Start-Sleep -Seconds $WaitSec

$proc.Refresh()
if ($proc.HasExited) {
  throw "进程已退出（退出码 $($proc.ExitCode)），界面没起来。看看是不是 WebView2 缺失或前端资源没打进去。"
}

$hwnd = $proc.MainWindowHandle
$rect = New-Object Win32Cap+RECT
$captured = $false

if ($hwnd -ne [IntPtr]::Zero) {
  [Win32Cap]::ShowWindow($hwnd, 9) | Out-Null   # SW_RESTORE
  [Win32Cap]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 800

  if ([Win32Cap]::GetWindowRect($hwnd, [ref]$rect)) {
    $w = $rect.Right - $rect.Left
    $h = $rect.Bottom - $rect.Top
    if ($w -gt 100 -and $h -gt 100) {
      $bmp = New-Object System.Drawing.Bitmap $w, $h
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size $w, $h))
      $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
      $g.Dispose(); $bmp.Dispose()
      $captured = $true
      Write-Host "已按窗口截图：$Out  (${w}x${h})" -ForegroundColor Green
    }
  }
}

if (-not $captured) {
  Write-Host "拿不到窗口矩形，退回整屏截图" -ForegroundColor Yellow
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "已整屏截图：$Out  ($($b.Width)x$($b.Height))" -ForegroundColor Green
}

if (-not $Keep) {
  Start-Sleep -Milliseconds 500
  if (-not $proc.HasExited) {
    $proc.CloseMainWindow() | Out-Null
    Start-Sleep -Seconds 2
    if (-not $proc.HasExited) { $proc.Kill() }
  }
  Write-Host "已关闭进程" -ForegroundColor DarkGray
} else {
  Write-Host "进程保持运行（-Keep）：PID=$($proc.Id)"
}
