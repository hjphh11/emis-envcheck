//! Windows 平台相关：管理员判定、以管理员身份重启自身。

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows_sys::Win32::UI::Shell::{IsUserAnAdmin, ShellExecuteW};
use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

/// 当前进程是否以管理员（高完整性令牌）身份运行。
///
/// 用 shell32 的 `IsUserAnAdmin`（内部就是检查令牌 Elevation），比再拼一遍
/// OpenProcessToken + GetTokenInformation 少几十行，也少两个 windows-sys feature。
pub fn is_admin() -> bool {
    // SAFETY: 无入参、无副作用的 shell32 查询。
    unsafe { IsUserAnAdmin() != 0 }
}

/// 转成以 NUL 结尾的 UTF-16，供 Win32 `*W` API 使用。
fn wide(s: &OsStr) -> Vec<u16> {
    s.encode_wide().chain(std::iter::once(0)).collect()
}

/// 以管理员身份重启当前 exe。
///
/// 成功返回 `Ok(())`，调用方随后退出旧进程；失败返回中文原因，旧进程继续运行。
pub fn relaunch_elevated() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| format!("无法定位当前程序路径：{e}"))?;
    let exe_w = wide(exe.as_os_str());
    let verb_w = wide(OsStr::new("runas"));

    // SAFETY: 字符串均以 NUL 结尾且在整个调用期间存活；其余参数允许为空。
    let ret = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb_w.as_ptr(),
            exe_w.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };

    // ShellExecuteW 约定：返回值 > 32 表示成功，否则是错误码。
    let code = ret as isize;
    if code <= 32 {
        let hint = match code {
            0 => "系统资源不足",
            2 => "找不到可执行文件",
            3 => "找不到路径",
            5 => "UAC 被取消或权限不足",
            31 => "没有关联的应用程序",
            _ => "系统拒绝提权",
        };
        return Err(format!(
            "以管理员身份重启失败（ShellExecuteW 返回 {code}，{hint}）"
        ));
    }
    Ok(())
}
