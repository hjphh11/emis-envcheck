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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 打开导出的报告 / 外链
        .plugin(tauri_plugin_opener::init())
        // 前端「导出报告」用 save() 弹保存框
        .plugin(tauri_plugin_dialog::init())
        // 前端「复制配置码」用 writeText()
        .plugin(tauri_plugin_clipboard_manager::init())
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
