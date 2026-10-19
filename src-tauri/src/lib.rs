//! 爱弥斯 · 环境检测 —— Tauri v2 后端入口。
//!
//! 分工：PowerShell 采集器（内嵌）负责采数据，Rust 只负责调用/补算/实时监控/窗口，
//! 前端只负责渲染。数据契约见 src/types.ts 与 docs/数据契约.md。

mod commands;
mod live;
mod scan;
mod types;
mod util;
mod win;

/// 崩溃日志文件名。放在 `%LOCALAPPDATA%\<应用目录>\` 下，删掉 exe 之外只留这一份文本，
/// 不违背绿色版「不往自身目录写文件」的承诺。
const CRASH_LOG_NAME: &str = "crash.log";

/// 安装 panic hook：把 panic 位置与消息追加到本地日志。
///
/// 为什么需要：release 配置是 `panic = "abort"`，进程直接消失，用户只会说
/// 「点了就闪退」，没有任何可排查线索（Windows 事件查看器里也只有一条无 detail 的记录）。
/// panic hook 在 abort 之前仍会执行，所以能留下最后一条线索。
/// hook 内部绝不能再 panic —— 全部用 `let _ =` 吞掉错误。
fn install_panic_logger() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        // 先按原样打印到 stderr（dev 下能直接看到）
        previous(info);

        let dir = std::env::var_os("LOCALAPPDATA")
            .map(std::path::PathBuf::from)
            .map(|p| p.join("EmisEnvCheck"))
            .unwrap_or_else(std::env::temp_dir);
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join(CRASH_LOG_NAME);

        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());
        let payload = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "（无法读取 panic 消息）".to_string()
        };
        // 本地时间由 util::local_iso8601 提供（带 +08:00 偏移）
        let line = format!(
            "[{}] panic at {}: {}\n",
            crate::util::local_iso8601(),
            location,
            payload
        );

        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            let _ = f.write_all(line.as_bytes());
        }
    }));
}

/// 第二次启动时把已有窗口拉到前台，然后让新进程退出。
///
/// 为什么需要：双击两次会开两个进程、并发跑两次 PowerShell 采集（每次 6 秒 + 24 个
/// 逻辑核的 WMI 查询），白烧 CPU，而且两个窗口叠在一起用户会以为卡住了。
fn focus_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    install_panic_logger();

    tauri::Builder::default()
        // 单实例：第二次启动直接把已有窗口顶到前台，不重复采集
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main_window(app);
        }))
        // 打开导出的报告 / 外链
        .plugin(tauri_plugin_opener::init())
        // 前端「导出报告」用 save() 弹保存框
        .plugin(tauri_plugin_dialog::init())
        // 前端「复制配置码」用 writeText()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|_app| Ok(()))
        .invoke_handler(tauri::generate_handler![
            commands::scan_all,
            commands::live_snapshot,
            commands::app_info,
            commands::relaunch_elevated,
            commands::write_text_file,
        ])
        .run(tauri::generate_context!())
        .expect("启动 爱弥斯 · 环境检测 失败");
}
