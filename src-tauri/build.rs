fn main() {
    // 把编译日期注入成环境变量，供 `app_info().buildDate` 使用。
    // 不引 chrono（build.rs 不值得为一行日期加依赖），手算公历日期。
    //
    // 为什么加 8 小时：SystemTime 是 UTC，直接按天取整会让东八区在
    // 00:00–08:00 之间构建出来的日期比本地「昨天」还早一天，
    // About 面板就会显示错误的构建日期。这里固定按 UTC+8（本项目只面向中文用户）。
    const UTC8_OFFSET_SECS: u64 = 8 * 3600;
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        + UTC8_OFFSET_SECS;
    let days = (secs / 86_400) as i64;
    let (y, m, d) = civil_from_days(days);
    println!("cargo:rustc-env=BUILD_DATE={y:04}-{m:02}-{d:02}");
    println!("cargo:rerun-if-changed=build.rs");

    tauri_build::build()
}

/// 把「1970-01-01 起的天数」换算成公历年月日（Howard Hinnant 的 civil_from_days）。
fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153; // [0, 11]
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32; // [1, 12]
    (y + i64::from(m <= 2), m, d)
}
