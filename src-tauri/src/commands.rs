//! 给前端 `invoke` 用的命令层。
//!
//! 命令名 / 参数名必须与 `docs/数据契约.md` 第 3 节、`src/lib/api.ts` 完全一致：
//! `scan_all`、`live_snapshot`、`app_info`、`relaunch_elevated`、
//! `write_text_file{path, content}`、`open_path{path}`、`open_url{url}`。

use crate::types::{AppInfo, LiveSnapshot, ScanResult};
use tauri::AppHandle;
use tauri_plugin_opener as opener_plugin;

/// 全量扫描。PowerShell 采集要 2~8 秒，放到阻塞线程池，别卡主线程/事件循环。
#[tauri::command]
pub async fn scan_all() -> Result<ScanResult, String> {
    let inner = tauri::async_runtime::spawn_blocking(crate::scan::scan_all)
        .await
        .map_err(|e| format!("扫描任务异常终止：{e}"))?;
    inner
}

/// 实时监控单次采样（前端每 1000ms 调一次）。
#[tauri::command]
pub fn live_snapshot() -> Result<LiveSnapshot, String> {
    crate::live::snapshot()
}

/// 应用信息（关于/页脚用）。
#[tauri::command]
pub fn app_info() -> AppInfo {
    AppInfo {
        name: "爱弥斯 · 环境检测".to_string(),
        // 版本以 Cargo.toml 为准，和 tauri.conf.json / package.json 保持同步
        version: env!("CARGO_PKG_VERSION").to_string(),
        author: "清吾".to_string(),
        homepage: "https://qingwu.ink".to_string(),
        // 构建日期：build.rs 注入的 BUILD_DATE，见下方 build_date()
        build_date: build_date(),
    }
}

/// 以管理员身份重启自身；提权进程起来后旧进程退出。
#[tauri::command]
pub fn relaunch_elevated(app: AppHandle) -> Result<(), String> {
    crate::win::relaunch_elevated()?;
    app.exit(0);
    Ok(())
}

/// 写文本文件（UTF-8，无 BOM）。保存对话框由前端插件弹出，这里只负责落盘。
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);
    // 用户可能在对话框里输入了还不存在的子目录，顺手建一下。
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            let _ = std::fs::create_dir_all(parent);
        }
    }
    std::fs::write(target, content.as_bytes())
        .map_err(|e| format!("写入文件失败：{e}（路径：{path}）"))
}

/// 用系统默认程序打开文件/文件夹。
#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    use opener_plugin::OpenerExt;
    app.opener()
        .open_path(path.as_str(), None::<&str>)
        .map_err(|e| format!("无法打开路径：{e}（{path}）"))
}

/// 用系统默认浏览器打开外部链接（qingwu.ink / 项目主页）。
#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    use opener_plugin::OpenerExt;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|e| format!("无法打开链接：{e}（{url}）"))
}

/// 构建日期：优先用 build.rs 注入的 `BUILD_DATE`（YYYY-MM-DD）；
/// 万一 release 链接时没带上（实测某些增量构建下会出现），退化为 exe 自身的修改时间（≈ 构建时间），
/// 最后才退到版本号 —— 保证契约要求的 `buildDate` 永远是个非空字符串。
fn build_date() -> String {
    if let Some(date) = option_env!("BUILD_DATE") {
        return date.to_string();
    }
    if let Some(date) = exe_build_date() {
        return date;
    }
    env!("CARGO_PKG_VERSION").to_string()
}

/// 从 exe 文件修改时间推本地日期（YYYY-MM-DD）。
fn exe_build_date() -> Option<String> {
    let modified = std::env::current_exe()
        .ok()
        .and_then(|path| std::fs::metadata(path).ok())
        .and_then(|meta| meta.modified().ok())?;
    let seconds = modified.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs() as i64;
    let offset = time::UtcOffset::current_local_offset().unwrap_or(time::UtcOffset::UTC);
    let local = time::OffsetDateTime::from_unix_timestamp(seconds)
        .ok()?
        .to_offset(offset);
    Some(format!(
        "{:04}-{:02}-{:02}",
        local.year(),
        u8::from(local.month()),
        local.day()
    ))
}
