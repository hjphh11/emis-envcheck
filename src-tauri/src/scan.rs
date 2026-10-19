//! `scan_all`：把 PowerShell 采集脚本内嵌进 exe，运行时释放到临时目录执行，
//! 读回它产出的 JSON，反序列化成 `ScanResult`，再补算 `meta` 字段。

use crate::types::ScanResult;
use crate::util::truncate_chars;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// 采集器源码：编译期内嵌，最终 exe 不依赖外部的 scripts/scan.ps1。
const SCAN_SCRIPT: &str = include_str!("../scripts/scan.ps1");

/// `CREATE_NO_WINDOW`：GUI 程序调用控制台程序时不弹黑框。
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 采集子进程的硬超时：超过这个时间还没退出就直接强杀。
/// WMI / 驱动查询偶发卡死时，没有它前端会一直转圈。
const SCAN_TIMEOUT: Duration = Duration::from_secs(20);

/// `try_wait` 的轮询间隔：既不做 100% 占核的忙等，也保证超时判定足够及时。
const SCAN_POLL_INTERVAL: Duration = Duration::from_millis(25);

/// 等读线程把管道读干的**上限**。
///
/// 为什么不能直接 `join()`：`child.kill()` 在 Windows 上只杀直接子进程。采集器会调用
/// wsl.exe / java.exe / dotnet.exe 等原生命令，只要有一个孙进程继承了 stdout/stderr 的
/// 写端句柄并且活得比父进程久，管道就永远不会 EOF，`read_to_end` 也就永远不返回，
/// `join` 随即永久阻塞 —— 实测过 `kill=true wait=true 耗时 1.68ms` 之后 6 秒，两个读线程
/// 仍然没有结束。那样 `scan_all` 永不返回，比原本要修的「无限转圈」更糟。
/// 所以这里改成「限时收，收不到就放弃线程（detach）」。
const PIPE_DRAIN_TIMEOUT: Duration = Duration::from_secs(2);

/// `taskkill /T /F` 杀掉整棵进程树时，给 taskkill 自身的超时。
/// 正常情况下它几十毫秒就返回；万一系统卡住也不能把采集流程再拖住。
const TASKKILL_TIMEOUT: Duration = Duration::from_secs(5);

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
    collect_with(script_path, json_path, SCAN_SCRIPT, SCAN_TIMEOUT)
}

/// `collect` 的可注入版本：脚本内容与超时时长都可替换。
///
/// 为什么要拆出这一层：超时/管道/杀进程树这条路径是「一旦写错就永久卡死」的高危代码，
/// 必须能被测试和探针用「故意挂住的脚本 + 极短超时」直接驱动，而不是靠等真实采集器卡住。
/// 生产路径（`scan_all`）仍然走上面的 `collect`，参数固定为内嵌脚本 + 20 秒。
fn collect_with(
    script_path: &Path,
    json_path: &Path,
    script: &str,
    timeout: Duration,
) -> Result<ScanResult, String> {
    write_script(script_path, script).map_err(|e| format!("无法写入临时采集脚本：{e}"))?;

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

    // 用 spawn 而不是 output()：`output()` 会一直阻塞到子进程退出，没有任何超时手段。
    let mut child = command.spawn().map_err(|e| {
        format!(
            "无法启动 PowerShell（{}）：{e}",
            powershell.display()
        )
    })?;

    // —— 为什么必须另起线程把管道读干 ——
    // Windows 匿名管道缓冲约 64KB。采集器正常情况下不往 stdout 写数据，但一旦脚本里有
    // `Write-Host` / 原生命令输出，缓冲写满后子进程就会阻塞在写操作上：主线程再怎么
    // `try_wait` 也等不到它退出，直接变成死锁。所以两个管道都 take 出来交给独立线程读完。
    let stdout_reader = child.stdout.take().map(spawn_pipe_reader);
    let stderr_reader = child.stderr.take().map(spawn_pipe_reader);
    // 在 `wait()` 关闭句柄之前，pid 不会被系统复用，taskkill /PID 不会误伤别的进程。
    let pid = child.id();

    // 主线程只做轻量轮询（25ms），不忙等；到点还没退出就判定超时。
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {
                if Instant::now() >= deadline {
                    break None;
                }
                std::thread::sleep(SCAN_POLL_INTERVAL);
            }
            Err(e) => {
                // 等不到状态时也要把整棵树收干净，别留孤儿进程和两个卡住的读线程。
                kill_process_tree(pid);
                let _ = child.kill();
                let _ = child.wait();
                drop_pipe_reader(stdout_reader);
                drop_pipe_reader(stderr_reader);
                return Err(format!("等待 PowerShell 采集进程时出错：{e}"));
            }
        }
    };

    let Some(status) = status else {
        // —— 超时分支：这是本文件最容易写出「永久阻塞」的地方 ——
        // `child.kill()` 只杀直接子进程；采集器拉起的 wsl.exe / java.exe / dotnet.exe 等孙进程
        // 会变成孤儿继续攥着管道写端，读线程等不到 EOF，`join` 就永远不返回（实测 kill+wait
        // 只花 1.68ms，6 秒后两个读线程仍然没结束）。所以顺序是：
        //   1) taskkill /T /F 连整棵进程树一起杀（顺手把管道写端关掉）；
        //   2) kill + wait 兜底回收直接子进程；
        //   3) 读线程只「限时收」，收不到就 detach，绝不 join。
        kill_process_tree(pid);
        let _ = child.kill();
        let _ = child.wait();
        drop_pipe_reader(stdout_reader);
        drop_pipe_reader(stderr_reader);
        return Err(
            "采集脚本超时（超过 20 秒未返回），已强制结束。可能是 WMI / 驱动查询卡住，请重试。"
                .to_string(),
        );
    };

    // 正常退出：先把输出限时收回来（此时孙进程可能还攥着写端，见 drain_pipe_reader），
    // 再回收子进程句柄。
    let (stdout, stdout_ok) = drain_pipe_reader(stdout_reader);
    if !stdout_ok {
        // stdout 收不全 = 还有孙进程攥着管道写端，先把树杀了，stderr 那边才能很快 EOF。
        kill_process_tree(pid);
    }
    let (stderr, stderr_ok) = drain_pipe_reader(stderr_reader);
    if !stderr_ok {
        // 子进程已退出，但仍有孙进程攥着 stderr 写端。此刻 `wait()` 还没调用、句柄仍在，
        // pid 不会被复用，taskkill 是安全的。清掉这棵树，避免残留进程一直挂在后台。
        kill_process_tree(pid);
    }
    let _ = child.wait();

    if !status.success() {
        let exit_code = status.code().unwrap_or(-1);
        let stderr = decode_console(&stderr);
        let stdout = decode_console(&stdout);
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
            // PowerShell 把 stderr 重定向时吐的是 CLIXML（合法 UTF-8 的 XML），
            // 直接拼给用户就是满屏 `<Objs Version=...>`，先剥成人类可读文本。
            truncate_chars(&strip_clixml(&detail), 500)
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

    let result = serde_json::from_str::<ScanResult>(raw).map_err(|e| {
        format!(
            "返回的 JSON 无法解析：{}（serde：{e}）",
            truncate_chars(raw.trim(), 200)
        )
    })?;

    // —— 最小有效性校验 ——
    // types.rs 的容错器对缺失字段一律给默认值，所以 `{}` 也能「成功」反序列化成
    // 一个各字段为空/0 的 ScanResult。若不在这里拦一道，采集脚本半途失败（比如只写出了
    // 半个 JSON）会被当成「0 分、全部未知」的正常扫描结果展示给用户。
    // 这里只校验「结构性缺失」，不做值域判断，避免误伤真实但特殊的机器。
    validate_scan(&result)?;

    Ok(result)
}

/// 扫描结果的最小有效性校验：缺哪一块就说哪一块，方便用户/日志定位。
///
/// 判定阈值刻意保守（只要求「非空」），因为不同机器的采集能力差异很大：
/// 有的机器没有独立显卡、有的系统读不到 TPM —— 那些都是正常情况，
/// 由采集器的 warnings 说明，不该在这里被判成失败。
fn validate_scan(result: &ScanResult) -> Result<(), String> {
    let mut missing: Vec<&str> = Vec::new();
    if result.compat.items.is_empty() {
        missing.push("兼容性检测项");
    }
    if result.score.parts.len() != 5 {
        missing.push("健康评分维度");
    }
    if result.disks.is_empty() {
        missing.push("硬盘信息");
    }
    if result.system.hostname.trim().is_empty() {
        missing.push("系统主机名");
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "采集器返回的数据不完整（缺少 {}），请重试。",
            missing.join("、")
        ))
    }
}

/// 把 PowerShell 的 CLIXML 错误流剥成纯文本。
///
/// 触发条件：PowerShell 在 stderr 被重定向时会输出
/// `#< CLIXML\n<Objs Version="1.1.0.1" ...><S S="Error">xxx</S>...</Objs>`。
/// 这段是合法 UTF-8，所以 `decode_console` 不会触发乱码兜底，会把整坨 XML 拼进错误文案。
///
/// 处理策略（从粗到细，任一步成功就返回）：
/// 1. 不含 CLIXML 标记 → 原样返回（普通 stderr 不受影响）；
/// 2. 抽出所有 `<S S="Error">` 的文本并反转义 —— 这是 PowerShell 真正想说的话；
/// 3. 抽不到 → 返回「详细日志已省略」，绝不把 XML 糊给用户。
fn strip_clixml(detail: &str) -> String {
    if !detail.contains("#< CLIXML") && !detail.contains("<Objs ") {
        return detail.to_string();
    }

    // 只抓错误流里的字符串节点：<S S="Error">...</S>（个别版本是 <S N="Message">）。
    let messages = extract_clixml_messages(detail);
    if !messages.is_empty() {
        return messages;
    }
    "（采集脚本执行失败，详细日志已省略）".to_string()
}

/// 从 CLIXML 里抽出 `<S ...>text</S>` 节点的文本，按出现顺序拼接，并反转义 XML 实体。
///
/// 不引正则库（任务约束：不新增 crate），手写一个足够用的扫描器：
/// 只需要处理 `<S` 开头、`>` 结束、直到 `</S>` 的节点，CLIXML 的结构稳定，够用。
fn extract_clixml_messages(detail: &str) -> String {
    let mut out = String::new();
    let mut rest = detail;
    while let Some(start) = rest.find("<S ") {
        let after_open = &rest[start + 3..];
        let Some(gt) = after_open.find('>') else {
            break;
        };
        let after_gt = &after_open[gt + 1..];
        let Some(end) = after_gt.find("</S>") else {
            break;
        };
        let text = unescape_xml(after_gt[..end].trim());
        if !text.is_empty() {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(&text);
        }
        rest = &after_gt[end + 4..];
    }
    out
}

/// 反转义 XML 里最常见的 5 个实体（`&amp;` 放最后，避免二次反转义）。
fn unescape_xml(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

/// 起一个线程把子进程的某个管道读到 EOF，读完把原始字节通过 channel 发回主线程。
///
/// 为什么用 `mpsc` 而不是 `JoinHandle`：见 `PIPE_DRAIN_TIMEOUT` 的注释 ——
/// 只要孙进程攥着写端，`read_to_end` 就不会返回，`join()` 会永久阻塞。
/// channel 让我们能「限时等」，等不到就把线程丢掉（detach），主线程照常往下走。
fn spawn_pipe_reader<R: Read + Send + 'static>(mut pipe: R) -> mpsc::Receiver<Vec<u8>> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        // 读失败（管道被强杀时常见 ERROR_BROKEN_PIPE）就把已经读到的部分发回去，
        // 至少不会丢掉半截错误信息。
        let _ = pipe.read_to_end(&mut buf);
        // 接收端可能已经被放弃（超时分支），send 失败是预期行为，忽略即可。
        let _ = tx.send(buf);
    });
    rx
}

/// 限时收读线程的输出。返回 `(数据, 是否完整读到 EOF)`。
///
/// 第二个返回值是给调用方判断「还有孙进程攥着管道」用的：
/// - `true`  = 读线程已经 EOF 并把数据发回来了；
/// - `false` = 超过 `PIPE_DRAIN_TIMEOUT` 还没收到 —— 线程 detach，数据按空处理。
///   这时候绝不能 `join`，否则就是本文件要修的那个永久阻塞。
fn drain_pipe_reader(receiver: Option<mpsc::Receiver<Vec<u8>>>) -> (Vec<u8>, bool) {
    match receiver {
        Some(rx) => match rx.recv_timeout(PIPE_DRAIN_TIMEOUT) {
            Ok(data) => (data, true),
            // 超时 / 发送端已断开：放弃这个线程，返回已拿到的东西（这里必然是空）。
            Err(_) => (Vec::new(), false),
        },
        None => (Vec::new(), true),
    }
}

/// 放弃读线程（detach）：不 `join`，直接丢掉接收端。
///
/// 线程本身会在管道 EOF 时自己结束；进程退出时未 join 的线程由系统回收，
/// 不存在资源泄漏。这是「宁可漏一个后台线程，也绝不永久卡住 UI」的取舍。
fn drop_pipe_reader(receiver: Option<mpsc::Receiver<Vec<u8>>>) {
    drop(receiver);
}

/// 用 `taskkill /T /F` 杀掉整棵进程树（含孙进程）。
///
/// `child.kill()` 只杀直接子进程，而采集器会调 wsl.exe / java.exe / dotnet.exe 等原生命令。
/// 只要有一个孙进程活着并继承着管道写端，读线程就等不到 EOF。这里连树一起杀，
/// 既让管道尽快关闭，也避免在用户机器上留下后台进程。
///
/// 失败一律忽略：pid 已经退出、没有权限、taskkill 不存在都无所谓 —— 这只是尽力而为的清理，
/// 真正决定成败的是上面的限时读线程。
fn kill_process_tree(pid: u32) {
    if pid == 0 {
        return;
    }
    let mut command = Command::new("taskkill");
    command
        .arg("/T")
        .arg("/F")
        .arg("/PID")
        .arg(pid.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    // 不用 output()：它会无限等 taskkill 自己退出。spawn + 限时 wait 更稳。
    let Ok(mut child) = command.spawn() else {
        return;
    };
    let deadline = Instant::now() + TASKKILL_TIMEOUT;
    while Instant::now() < deadline {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(_) => break,
        }
    }
    // taskkill 自己卡住了：杀掉它，别把采集流程一起拖死。
    let _ = child.kill();
    let _ = child.wait();
}

/// 写临时脚本。刻意带上 UTF-8 BOM：
/// Windows PowerShell 5.1 对无 BOM 的脚本按 ANSI 代码页解码，脚本里若有中文会乱码甚至解析出错，
/// 带 BOM 则 5.1 / 7.x 都能正确识别（当前采集器本体是纯 ASCII，加 BOM 只是防回归）。
fn write_script(path: &Path, script: &str) -> std::io::Result<()> {
    let mut bytes = Vec::with_capacity(script.len() + 3);
    bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    bytes.extend_from_slice(script.as_bytes());
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
        assert!(
            json["runtime"].get("software").is_some(),
            "runtime.software 必须透传到前端（空数组也要保留字段）"
        );
        assert!(json.get("compat").is_some());
        assert!(json.get("score").is_some());
    }

    // ============================================================
    // P0-1 回归测试：超时必须能「限时返回」，而不是卡在读线程上
    // ============================================================

    /// 构造一个「父进程已经退出、但孙进程还攥着 stdout/stderr 写端」的场景，
    /// 这是实测里让 `join_pipe_reader` 永久阻塞的根因。
    ///
    /// 脚本行为：
    /// 1. 启动一个后台 `powershell` 孙进程，让它继承 stdout/stderr 句柄并睡 60 秒；
    /// 2. 父进程自己立刻退出。
    ///
    /// 于是主进程 `try_wait` 会看到「已退出」，但两个管道永远不会 EOF。
    /// 修复前：`drain`（旧的 join）永久阻塞；修复后：2 秒上限内返回。
    ///
    /// 用一个极短超时（800ms）驱动，整体耗时必须在几秒内，否则就是又卡住了。
    #[test]
    #[cfg(windows)]
    fn timeout_returns_instead_of_blocking_on_pipe_readers() {
        // 孙进程：继承 stdout/stderr，睡 60 秒。Start-Sleep 期间它一直持有管道写端。
        // 注意这里用 -EncodedCommand 无所谓，直接 Start-Process 起一个 powershell 即可。
        let script = r#"
$ErrorActionPreference='SilentlyContinue'
Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-Command','Start-Sleep -Seconds 60' -NoNewWindow | Out-Null
exit 0
"#;
        let stamp = unique_stamp();
        let script_path = std::env::temp_dir().join(format!("emis-probe-timeout-{stamp}.ps1"));
        let json_path = std::env::temp_dir().join(format!("emis-probe-timeout-{stamp}.json"));

        let started = Instant::now();
        // 超时设 800ms：父进程几乎立刻退出，所以这里主要考验「正常退出分支」里的
        // 限时 drain；无论走哪个分支，都不允许永久阻塞。
        let result = collect_with(&script_path, &json_path, script, Duration::from_millis(800));
        let elapsed = started.elapsed();

        let _ = std::fs::remove_file(&script_path);
        let _ = std::fs::remove_file(&json_path);

        // 父进程退出码 0、但没写 JSON → 应报「没有生成结果文件」，而不是卡死。
        assert!(result.is_err(), "没有 JSON 时应返回错误");
        // 关键断言：必须在「超时 + 2 秒 drain + taskkill」的预算内返回。
        // 旧实现会卡到孙进程 60 秒后自己退出（实际是永久，因为读线程还在等）。
        assert!(
            elapsed < Duration::from_secs(15),
            "collect 必须限时返回，实际耗时 {elapsed:?}"
        );
    }

    /// 超时分支本身：脚本自己睡很久，验证在 timeout 附近返回且错误文案不变。
    #[test]
    #[cfg(windows)]
    fn hard_timeout_kills_and_reports_chinese_message() {
        let script = "Start-Sleep -Seconds 60\n";
        let stamp = unique_stamp();
        let script_path = std::env::temp_dir().join(format!("emis-probe-hang-{stamp}.ps1"));
        let json_path = std::env::temp_dir().join(format!("emis-probe-hang-{stamp}.json"));

        let started = Instant::now();
        let result = collect_with(&script_path, &json_path, script, Duration::from_millis(700));
        let elapsed = started.elapsed();

        let _ = std::fs::remove_file(&script_path);
        let _ = std::fs::remove_file(&json_path);

        let err = result.expect_err("挂住的脚本必须超时");
        assert!(err.contains("采集脚本超时"), "错误文案应保持原样：{err}");
        assert!(err.contains("20 秒"), "文案里的秒数不应被测试超时改写：{err}");
        // 700ms 超时 + 最多 2s drain + taskkill，留足余量但远小于 60 秒。
        assert!(elapsed < Duration::from_secs(15), "超时后应迅速返回：{elapsed:?}");
    }

    // ============================================================
    // P1-2 / P2-1 单元测试
    // ============================================================

    /// `{}` 能被容错器解析成默认值，所以必须被 validate_scan 拦下。
    #[test]
    fn empty_result_is_rejected_by_validation() {
        let scan: ScanResult = serde_json::from_str("{}").expect("{} 会被容错器接受");
        let err = validate_scan(&scan).expect_err("空结果必须被校验拦下");
        assert!(err.contains("数据不完整"), "文案应说明数据不完整：{err}");
        // 四类缺失应全部报出来，方便定位
        for keyword in ["兼容性", "健康评分", "硬盘", "主机名"] {
            assert!(err.contains(keyword), "应指出缺少「{keyword}」：{err}");
        }
    }

    /// 真实样本必须通过校验（防止校验过严误伤正常路径）。
    #[test]
    fn real_sample_passes_validation() {
        let sample = include_str!("../../dev/sample-scan.json");
        let scan: ScanResult =
            serde_json::from_str(sample).expect("真实样本必须能被 ScanResult 反序列化");
        validate_scan(&scan).expect("真实样本必须通过最小有效性校验");
    }

    /// CLIXML 必须被剥成人类可读文本。
    #[test]
    fn clixml_is_stripped_to_plain_text() {
        let raw = "#< CLIXML\n<Objs Version=\"1.1.0.1\" xmlns=\"http://schemas.microsoft.com/powershell/2004/04\">\
<Obj S=\"progress\" RefId=\"0\"><TN RefId=\"0\"><T>System.Management.Automation.PSCustomObject</T></TN></Obj>\
<S S=\"Error\">无法找到路径 &amp; 对象。</S>\
<S S=\"Error\">第二个错误</S></Objs>";
        let text = strip_clixml(raw);
        assert!(!text.contains("<Objs"), "不应残留 XML：{text}");
        assert!(!text.contains("CLIXML"), "不应残留 CLIXML 标记：{text}");
        assert!(text.contains("无法找到路径 & 对象。"), "应抽出并反转义：{text}");
        assert!(text.contains("第二个错误"), "应抽出所有错误节点：{text}");
    }

    /// 抽不出节点时给兜底文案，而不是把 XML 怼给用户。
    #[test]
    fn clixml_without_messages_falls_back() {
        let raw = "#< CLIXML\n<Objs Version=\"1.1.0.1\"><Obj /></Objs>";
        let text = strip_clixml(raw);
        assert!(text.contains("详细日志已省略"), "应返回兜底文案：{text}");
    }

    /// 普通 stderr 不能被 CLIXML 逻辑误伤。
    #[test]
    fn plain_stderr_is_untouched() {
        let raw = "采集脚本执行失败：拒绝访问。";
        assert_eq!(strip_clixml(raw), raw);
    }
}
