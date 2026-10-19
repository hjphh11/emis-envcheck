//! 给前端 `invoke` 用的命令层。
//!
//! 命令名 / 参数名必须与 `docs/数据契约.md` 第 3 节、`src/lib/api.ts` 完全一致：
//! `scan_all`、`live_snapshot`、`app_info`、`relaunch_elevated`、`write_text_file{path, content}`。
//!
//! 注：v1.3.0 删掉了 `open_path` / `open_url` 两个命令。原因是它们调用的是
//! tauri-plugin-opener 的 `Opener` 方法，而插件源码明确写着「These methods do not
//! perform any scope check」——capabilities 里配的 `opener:default` 对它们完全无效，
//! 于是任何能触达 IPC 的代码都能打开任意 scheme / 任意 exe。前端实际用的是
//! npm 包 `@tauri-apps/plugin-opener`（走插件命令，受 scope 约束），这两个 Rust 命令
//! 从头到尾没有任何调用点，属于死代码 + 攻击面，直接删除。

use crate::types::{AppInfo, LiveSnapshot, ScanResult};
use std::path::{Path, PathBuf};

/// 全量扫描。PowerShell 采集要 2~8 秒，放到阻塞线程池，别卡主线程/事件循环。
#[tauri::command]
pub async fn scan_all() -> Result<ScanResult, String> {
    tauri::async_runtime::spawn_blocking(crate::scan::scan_all)
        .await
        .map_err(|e| format!("扫描任务异常终止：{e}"))?
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
pub fn relaunch_elevated(app: tauri::AppHandle) -> Result<(), String> {
    crate::win::relaunch_elevated()?;
    app.exit(0);
    Ok(())
}

/// 允许写出的扩展名。应用只导出 HTML / JSON 报告，外加纯文本说明。
const ALLOWED_EXTS: [&str; 3] = ["html", "json", "txt"];

/// 写文本文件（UTF-8，无 BOM）。保存对话框由前端插件弹出，这里只负责落盘。
///
/// 为什么这里要校验路径：
/// 这个命令对整个 webview 开放，而 webview 里跑的是渲染后的采集数据（SMBIOS/磁盘型号
/// 都是半可信输入）。哪怕前端只传对话框返回值，一旦渲染层被注入，未校验的
/// `std::fs::write` 就等于「任意路径覆盖写」——能把 exe 换成别的文件、能覆盖用户文档。
/// 校验成本几乎为零，所以按最小必要放行：
///   1. 必须是绝对路径（排除相对路径被解析到意外位置）
///   2. 不允许 `..` 组件（排除路径穿越）
///   3. 扩展名必须是 html / json / txt
///   4. 不允许写进 Windows / System32 / Program Files / ProgramData 等系统目录
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(&path);

    if !target.is_absolute() {
        return Err(format!("拒绝写入：必须是绝对路径（收到：{path}）"));
    }
    if target
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(format!("拒绝写入：路径不能包含 `..`（收到：{path}）"));
    }
    let ext = target
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !ALLOWED_EXTS.contains(&ext.as_str()) {
        return Err(format!(
            "拒绝写入：只允许 .html / .json / .txt 文件（收到：{path}）"
        ));
    }
    if let Some(reason) = forbidden_system_dir(&target) {
        return Err(format!("拒绝写入：不能写入{reason}（收到：{path}）"));
    }

    // 用户可能在对话框里输入了还不存在的子目录，顺手建一下。
    // 父目录为空（如 `C:\x.html` 的父级是 `C:\`）时 create_dir_all 是幂等的，直接调即可。
    if let Some(parent) = target.parent().filter(|p| !p.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("无法创建目录：{e}（路径：{path}）"))?;
    }
    std::fs::write(&target, content.as_bytes())
        .map_err(|e| format!("写入文件失败：{e}（路径：{path}）"))
}

/// 判断目标是否落在系统目录内，返回中文原因。
///
/// 用 `starts_with` 比较**路径组件**而不是字符串前缀，否则
/// `C:\Program Files2\x` 会被误判成在 `C:\Program Files` 里（反面 case 也存在）。
fn forbidden_system_dir(target: &Path) -> Option<&'static str> {
    let mut roots: Vec<(PathBuf, &'static str)> = Vec::new();
    for (var, reason) in [
        ("SystemRoot", " Windows 系统目录"),
        ("ProgramFiles", " Program Files 目录"),
        ("ProgramFiles(x86)", " Program Files 目录"),
        ("ProgramData", " ProgramData 目录"),
    ] {
        if let Some(value) = std::env::var_os(var) {
            let p = PathBuf::from(value);
            if p.is_absolute() {
                roots.push((p, reason));
            }
        }
    }
    for (root, reason) in roots {
        if target.starts_with(&root) {
            return Some(reason);
        }
    }
    None
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
    let seconds = modified
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
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
