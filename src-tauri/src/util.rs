//! 小工具：本地时间 ISO-8601 格式化、错误文案截断。

/// 当前本地时间的 ISO-8601 字符串，带真实 UTC 偏移（中国机器上是 `+08:00`）。
///
/// 契约要求：`2026-10-18T19:30:00+08:00`（不带毫秒、不写 `Z`）。
/// 若系统拒绝提供本地时区（极少见），退化为 UTC+8，保证前端拿到可用字符串。
pub fn local_iso8601() -> String {
    let now = match time::OffsetDateTime::now_local() {
        Ok(dt) => dt,
        Err(_) => time::OffsetDateTime::now_utc() + time::Duration::hours(8),
    };
    let offset_secs = now.offset().whole_seconds();
    let sign = if offset_secs < 0 { '-' } else { '+' };
    let abs = offset_secs.unsigned_abs();
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}{}{:02}:{:02}",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
        sign,
        abs / 3600,
        (abs % 3600) / 60
    )
}

/// 按**字符**（不是字节）截断，避免把中文/emoji 切坏。
pub fn truncate_chars(input: &str, max_chars: usize) -> String {
    let mut chars = input.chars();
    let head: String = chars.by_ref().take(max_chars).collect();
    if chars.next().is_some() {
        format!("{head}…")
    } else {
        head
    }
}
