#!/usr/bin/env node
/**
 * ============================================================
 *  scripts/set-version.mjs —— 一条命令改掉所有版本号
 * ============================================================
 *
 * 为什么需要它：版本号散落在 4 个「必须同步」的文件 + 若干「跟着走」的兜底常量里。
 * 手工改漏一处，会出现「exe 是 1.2.0、页脚显示 1.1.0、zip 叫 1.0.0」这种问题，
 * 而且构建不会报错，只有用户能看出来。
 *
 * 用法：
 *   node scripts/set-version.mjs 1.3.0            # 改版本
 *   node scripts/set-version.mjs 1.3.0 --dry-run  # 只看会改什么
 *   node scripts/set-version.mjs --check          # 只校验一致性（CI 用，不一致则退出码 1）
 *
 * 退出码：0 = 成功/一致；1 = 失败/不一致。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SEMVER = /^\d+\.\d+\.\d+$/;

/** 必须完全同步的四处（构建产物会直接体现） */
const REQUIRED = [
  {
    file: "package.json",
    read: (t) => JSON.parse(t).version,
    write: (t, v) => t.replace(/("version"\s*:\s*")[^"]+(")/, `$1${v}$2`),
  },
  {
    file: "package-lock.json",
    // lockfile 里有两处：顶层 version 和 packages[""].version
    read: (t) => JSON.parse(t).version,
    write: (t, v) => {
      const obj = JSON.parse(t);
      obj.version = v;
      if (obj.packages && obj.packages[""]) obj.packages[""].version = v;
      return JSON.stringify(obj, null, 2) + "\n";
    },
  },
  {
    file: "src-tauri/Cargo.toml",
    read: (t) => (t.match(/^version\s*=\s*"([^"]+)"/m) || [])[1],
    write: (t, v) => t.replace(/^(version\s*=\s*")[^"]+(")/m, `$1${v}$2`),
  },
  {
    file: "src-tauri/tauri.conf.json",
    read: (t) => JSON.parse(t).version,
    write: (t, v) => t.replace(/("version"\s*:\s*")[^"]+(")/, `$1${v}$2`),
  },
];

/** 「跟着走」的兜底常量：不是构建依据，但漏改会让界面显示旧版本 */
const FOLLOWERS = [
  {
    file: "src/App.tsx",
    pattern: /(\|\|\s*")\d+\.\d+\.\d+(")/,
    label: "app_info() 失败时的页脚兜底",
  },
  {
    file: "src/lib/api.ts",
    pattern: /(version:\s*")\d+\.\d+\.\d+(")/,
    label: "浏览器预览的 appInfo 版本",
  },
  {
    file: "src/lib/report.ts",
    pattern: /(\|\|\s*")\d+\.\d+\.\d+(")/,
    label: "导出报告的版本兜底",
  },
  {
    file: "src/mock/sample.ts",
    // 必须锚定到文件末尾的 mockAppInfo 块：文件里还有 system.version / 各种软件版本号，
    // 宽松的 /version:\s*"x.y.z"/ 会误伤 system.version（"10.0.26100"）。
    pattern: /(export const mockAppInfo[\s\S]*?\n\s*version:\s*")\d+\.\d+\.\d+(")/,
    label: "mock 的 AppInfo 版本",
  },
];

/** 注意：scan.ps1 的 collectorVersion 故意不在列表里 —— 采集器版本独立于程序版本 */

function readFile(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const check = args.includes("--check");
  const target = args.find((a) => !a.startsWith("--"));

  if (check) {
    const versions = REQUIRED.map((f) => ({ file: f.file, version: f.read(readFile(f.file)) }));
    const base = versions[0].version;
    let ok = true;
    console.log(`基准版本（package.json）：${base}\n`);
    for (const v of versions) {
      const match = v.version === base;
      if (!match) ok = false;
      console.log(`  ${match ? "OK  " : "FAIL"}  ${v.file.padEnd(30)} ${v.version}`);
    }

    // 顺带报告 followers 是否跟上了
    console.log("\n兜底常量：");
    for (const f of FOLLOWERS) {
      const m = readFile(f.file).match(f.pattern);
      const v = m ? m[0].replace(/[^\d.]/g, "") : "(未找到)";
      const match = v === base;
      if (!match) ok = false;
      console.log(`  ${match ? "OK  " : "FAIL"}  ${f.file.padEnd(30)} ${v}  (${f.label})`);
    }

    if (!ok) {
      console.error("\n版本号不一致。跑 `node scripts/set-version.mjs <version>` 统一。");
      process.exit(1);
    }
    console.log("\n全部一致。");
    return;
  }

  if (!target || !SEMVER.test(target)) {
    console.error("用法：node scripts/set-version.mjs <x.y.z> [--dry-run]");
    console.error("      node scripts/set-version.mjs --check");
    process.exit(1);
  }

  const changes = [];

  for (const f of REQUIRED) {
    const before = readFile(f.file);
    const current = f.read(before);
    if (current === target) continue;
    const after = f.write(before, target);
    changes.push({ file: f.file, from: current, to: target });
    if (!dryRun) writeFileSync(join(ROOT, f.file), after, "utf8");
  }

  for (const f of FOLLOWERS) {
    const before = readFile(f.file);
    if (!f.pattern.test(before)) {
      console.warn(`  跳过 ${f.file}：没匹配到版本号模式（${f.label}）`);
      continue;
    }
    const after = before.replace(f.pattern, `$1${target}$2`);
    if (after === before) continue;
    const m = before.match(f.pattern);
    changes.push({
      file: f.file,
      from: m[0].replace(/[^\d.]/g, ""),
      to: target,
      note: f.label,
    });
    if (!dryRun) writeFileSync(join(ROOT, f.file), after, "utf8");
  }

  if (changes.length === 0) {
    console.log(`所有文件已经是 ${target}，无需修改。`);
    return;
  }

  console.log(dryRun ? "将要修改：" : "已修改：");
  for (const c of changes) {
    console.log(`  ${c.file.padEnd(30)} ${c.from} -> ${c.to}${c.note ? `  (${c.note})` : ""}`);
  }
  if (dryRun) console.log("\n（--dry-run：没有真的写文件）");
  else console.log("\n记得重新构建：pwsh -File scripts/build-portable.ps1");
}

main();
