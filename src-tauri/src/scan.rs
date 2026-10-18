//! `scan_all`：把 PowerShell 采集脚本内嵌进 exe，运行时释放到临时目录执行，
//! 读回它产出的 JSON，反序列化成 `ScanResult`，再补算 `meta` 字段。

use crate::types::ScanResult;
use crate::util::truncate_chars;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Instant;

/// 采集器源码：编译期内嵌，最终 exe 不依赖外部的 scripts/scan.ps1。
const SCAN_SCRIPT: &str = include_str!("../scripts/scan.ps1");

/// `CREATE_NO_WINDOW`：GUI 程序调用控制台程序时不弹黑框。
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 全量扫描。时间统计覆盖「写临时脚本 → PowerShell 采集 → 读回 JSON」全过程。
pub fn scan_all() -> Result<ScanResult, String> {
    let started = Instant::now();
    cleanup_stale_temp_files();
    let stamp = unique_stamp();
    let script_path = std::env::temp_dir().join(format!("emis-envcheck-{stamp}.ps1"));
    let json_path = std::env::temp_dir().join(format!("emis-envcheck-{stamp}.json"));

    let collected = collect(&script_path, &json_path);

    // 无论成败都清理临时文件（包含脚本本身，避免在 %TEMP% 里留垃圾）。
    let _ = std::fs::remove_file(&script_path);
    let _ = std::fs::remove_file(&json_path);

    let mut result = collected?;

    // 以 Rust 侧的真实耗时/时间为准（采集器自己填的只是估算）。
    result.meta.scan_ms = started.elapsed().as_secs_f64() * 1000.0;
    result.meta.generated_at = crate::util::local_iso8601();
    result.meta.is_admin = crate::win::is_admin();
    if result.meta.collector_version.trim().is_empty() {
        result.meta.collector_version = "unknown".to_string();
    }

    Ok(result)
}

/// 写脚本 → 跑 PowerShell → 读 JSON，三步的完整流程。
fn collect(script_path: &Path, json_path: &Path) -> Result<ScanResult, String> {
    write_script(script_path).map_err(|e| format!("无法写入临时采集脚本：{e}"))?;

    let powershell = powershell_path();

    // —— 为什么用 -EncodedCommand 而不是 -File ——
    // 1. Windows PowerShell 5.1 的 stdout/stderr 走**控制台 OEM 代码页**（中文系统是 GBK/CP936），
    //    Rust 侧按 UTF-8 解会把「采集脚本执行失败…」变成一堆 `�`。
    //    引导命令里先把 [Console]::OutputEncoding 切成 UTF-8，stderr 就能正常解码。
    // 2. 采集脚本路径 / JSON 路径改用 `& '...'` 调用并由单引号包裹，路径里有空格、单引号也不会
    //    被 PowerShell 的参数解析搞坏。
    // 临时 .ps1 仍然保留（几十万字符塞不进命令行），JSON 仍通过 -OutFile 落地。
    let bootstrap = build_bootstrap(script_path, json_path);
    let encoded = base64_utf16le(&bootstrap);

    let mut command = Command::new(&powershell);
    command
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-EncodedCommand")
        .arg(encoded)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // 发布版是 windows_subsystem = "windows"，不加这个标志会弹出一个黑框。
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command.output().map_err(|e| {
        format!(
            "无法启动 PowerShell（{}）：{e}",
            powershell.display()
        )
    })?;

    if !output.status.success() {
        let exit_code = output.status.code().unwrap_or(-1);
        let stderr = decode_console(&output.stderr);
        let stdout = decode_console(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            stderr.trim().to_string()
        };
        // 万一还是解不出来（例如引导命令本身都没跑起来），别把 `�` 直接怼到用户脸上。
        let detail = if detail.is_empty() {
            "（脚本没有输出错误详情）".to_string()
        } else if detail.contains('\u{FFFD}') {
            "（错误输出编码无法识别，已省略原始内容）".to_string()
        } else {
            truncate_chars(&detail, 500)
        };
        return Err(format!("采集脚本执行失败（退出码 {exit_code}）：{detail}"));
    }

    let raw = std::fs::read_to_string(json_path).map_err(|e| {
        format!(
            "采集脚本没有生成结果文件（{e}）：{}",
            truncate_chars(&json_path.display().to_string(), 200)
        )
    })?;
    // PowerShell 5.1 的 UTF8Encoding 有带 BOM/不带 BOM 两种写法，这里都兼容。
    let raw = raw.trim_start_matches('\u{feff}');
    if raw.trim().is_empty() {
        return Err("采集脚本输出为空：没有采到任何数据".to_string());
    }

    serde_json::from_str::<ScanResult>(raw).map_err(|e| {
        format!(
            "返回的 JSON 无法解析：{}（serde：{e}）",
            truncate_chars(raw.trim(), 200)
        )
    })
}

/// 写临时脚本。刻意带上 UTF-8 BOM：
/// Windows PowerShell 5.1 对无 BOM 的脚本按 ANSI 代码页解码，脚本里若有中文会乱码甚至解析出错，
/// 带 BOM 则 5.1 / 7.x 都能正确识别（当前采集器本体是纯 ASCII，加 BOM 只是防回归）。
fn write_script(path: &Path) -> std::io::Result<()> {
    let mut bytes = Vec::with_capacity(SCAN_SCRIPT.len() + 3);
    bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    bytes.extend_from_slice(SCAN_SCRIPT.as_bytes());
    std::fs::write(path, bytes)
}

/// 传给 `-EncodedCommand` 的引导脚本：切 UTF-8 控制台编码 → 调用采集脚本 → 按脚本成功与否给退出码。
fn build_bootstrap(script_path: &Path, json_path: &Path) -> String {
    let script = ps_single_quoted(&script_path.display().to_string());
    let out = ps_single_quoted(&json_path.display().to_string());
    format!(
        "$ErrorActionPreference='Continue'; \
         try {{ [Console]::OutputEncoding=[System.Text.Encoding]::UTF8 }} catch {{ }}; \
         $code=0; \
         try {{ & '{script}' -OutFile '{out}'; if (-not $?) {{ $code=1 }} }} \
         catch {{ try {{ [Console]::Error.WriteLine($_.Exception.Message) }} catch {{ }}; $code=1 }}; \
         exit $code"
    )
}

/// PowerShell 单引号字符串转义：内部 `'` 要写成 `''`。
fn ps_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

/// PowerShell `-EncodedCommand` 要求「UTF-16LE 字节的 Base64」。
/// 手写一个，省得为这 20 行加 base64 依赖。
fn base64_utf16le(text: &str) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bytes: Vec<u8> = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = u32::from(chunk[0]);
        let b1 = u32::from(*chunk.get(1).unwrap_or(&0));
        let b2 = u32::from(*chunk.get(2).unwrap_or(&0));
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(char::from(TABLE[((n >> 18) & 63) as usize]));
        out.push(char::from(TABLE[((n >> 12) & 63) as usize]));
        out.push(if chunk.len() > 1 {
            char::from(TABLE[((n >> 6) & 63) as usize])
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            char::from(TABLE[(n & 63) as usize])
        } else {
            '='
        });
    }
    out
}

/// 解子进程输出：优先 UTF-8；不是合法 UTF-8 时按中文 Windows 的 GBK(CP936) 再解一次。
fn decode_console(bytes: &[u8]) -> String {
    if bytes.is_empty() {
        return String::new();
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_string();
    }
    #[cfg(windows)]
    if let Some(text) = decode_multibyte(bytes, 936) {
        return text;
    }
    String::from_utf8_lossy(bytes).into_owned()
}

#[cfg(windows)]
fn decode_multibyte(bytes: &[u8], codepage: u32) -> Option<String> {
    use windows_sys::Win32::Globalization::{MultiByteToWideChar, MB_ERR_INVALID_CHARS};
    // SAFETY: 指针与长度都来自同一个 `bytes` 切片；两次调用之间没有并发修改。
    let needed = unsafe {
        MultiByteToWideChar(
            codepage,
            MB_ERR_INVALID_CHARS,
            bytes.as_ptr(),
            bytes.len() as i32,
            std::ptr::null_mut(),
            0,
        )
    };
    if needed <= 0 {
        return None;
    }
    let mut utf16 = vec![0u16; needed as usize];
    let written = unsafe {
        MultiByteToWideChar(
            codepage,
            MB_ERR_INVALID_CHARS,
            bytes.as_ptr(),
            bytes.len() as i32,
            utf16.as_mut_ptr(),
            needed,
        )
    };
    if written <= 0 {
        return None;
    }
    utf16.truncate(written as usize);
    Some(String::from_utf16_lossy(&utf16))
}

/// 优先用绝对路径调 Windows PowerShell 5.1，避免 PATH 被裁剪后找不到 powershell。
fn powershell_path() -> PathBuf {
    if let Some(system_root) = std::env::var_os("SystemRoot") {
        let candidate = PathBuf::from(system_root)
            .join("System32")
            .join("WindowsPowerShell")
            .join("v1.0")
            .join("powershell.exe");
        if candidate.is_file() {
            return candidate;
        }
    }
    PathBuf::from("powershell")
}

/// 进程被强制结束（任务管理器 / 关机）时，`scan_all` 的清理逻辑跑不到，
/// 会在 %TEMP% 留一份 .ps1 + .json。每次扫描开始时顺手清掉**超过 1 小时**的残留：
/// 用时间阈值而不是「全删」，是为了避免把另一个正在运行的实例的临时文件删掉。
fn cleanup_stale_temp_files() {
    let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) else {
        return;
    };
    let now = std::time::SystemTime::now();
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(file_name) = file_name.to_str() else {
            continue;
        };
        if !file_name.starts_with("emis-envcheck-") {
            continue;
        }
        let Ok(modified) = entry.metadata().and_then(|m| m.modified()) else {
            continue;
        };
        let age = now.duration_since(modified).unwrap_or_default();
        if age.as_secs() >= 3600 {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// `%TEMP%\emis-envcheck-<pid>-<nanos>`：进程内多次扫描也不会互相踩。
fn unique_stamp() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}-{}", std::process::id(), nanos)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 冒烟测试：真的调用一次 PowerShell 采集，验证「内嵌脚本 → 临时文件 → JSON → ScanResult」
    /// 全链路。会跑 2~8 秒并依赖 Windows PowerShell，默认 `cargo test` 跳过，
    /// 需要时手动跑：`cargo test -- --ignored`。
    #[test]
    #[ignore = "会调用 PowerShell 采集，本地手动执行（cargo test -- --ignored）"]
    fn scan_all_smoke() {
        let result = scan_all().expect("扫描链路应成功");

        // Rust 侧补算的字段
        assert!(result.meta.scan_ms > 0.0, "scanMs 应被填成真实耗时");
        assert!(
            result.meta.generated_at.contains('T') && result.meta.generated_at.contains(':'),
            "generatedAt 应是 ISO-8601：{}",
            result.meta.generated_at
        );
        assert!(
            !result.meta.collector_version.is_empty(),
            "collectorVersion 不应为空"
        );

        // 序列化回前端时必须仍是 camelCase
        let json = serde_json::to_value(&result).expect("ScanResult 应可序列化");
        assert!(json.get("meta").is_some());
        assert!(json["meta"].get("scanMs").is_some(), "必须是 scanMs 而不是 scan_ms");
        assert!(json["meta"].get("generatedAt").is_some());
        assert!(json.get("motherboard").is_some());
        assert!(json["cpu"].get("physicalCores").is_some());
        assert!(json.get("compat").is_some());
        assert!(json.get("score").is_some());
    }
}
