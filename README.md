<div align="center">

<img src="assets/icon-source.png" width="112" alt="爱弥斯 · 环境检测" />

# 爱弥斯 · 环境检测

**一个绿色便携的 Windows 电脑环境检测工具 —— 双击就能用，不装任何东西。**

制作 **清吾** · [qingwu.ink](https://qingwu.ink) ｜ 主题形象 **爱弥斯**

</div>

---

## 这是什么

把你的电脑「体检」一遍：硬件是什么、系统什么状态、跑得动什么、能不能升 Windows 11，
全部收在一屏玻璃卡里 —— 视觉沿用 [清吾](https://qingwu.ink) 博客的暖色二次元风格
（玫瑰粉 / 绯红 / 奶油白 / 琥珀金，玻璃拟态 + 克制动效）。

- 🟢 **绿色版**：单个 `.exe`，不写注册表、不装服务、不进开机启动，拷到 U 盘就能跑
- 🏥 **体检**：CPU / 内存 / 显卡 / 硬盘 / 主板 / 系统 / 网络 全量采集 + 0–100 健康评分
- 🧰 **环境**：.NET Framework / .NET / VC++ 运行库 / DirectX / WebView2 / Java / Node / Python / Git / WSL
- ✅ **兼容**：逐项判定这台机器能不能升 Windows 11，不通过的项直接告诉你差在哪
- 📈 **监控**：CPU 每核占用、内存、网络上下行、磁盘读写，1 秒刷新的实时曲线
- 📄 **报告**：导出 HTML / JSON，配置码一键复制

## 四个页签

| 页签 | 你会看到 |
|---|---|
| **体检** | 健康评分环 + 五维子分 + 硬件详情卡 + 配置码 |
| **环境** | 这台机器装了哪些运行库、版本多少、路径在哪、缺什么 |
| **兼容** | Windows 11 升级逐项检测：通过 / 警告 / 不通过 + 原因 |
| **监控** | 实时曲线，看看现在谁在吃 CPU / 内存 / 带宽 |

## 下载与使用

1. 从 Releases 下载 `爱弥斯·环境检测.exe`
2. 放到任意目录（桌面、U 盘、移动硬盘都行），双击
3. 首次会花 2–6 秒扫描，之后随开随用

> 想拿到温度、风扇转速、硬盘 SMART 明细、TPM 状态这些**深度数据**，需要管理员权限：
> 界面上有「以管理员重启」按钮，点一下即可。普通权限也能用，只是对应项显示为不可用。

## 技术栈

| 层 | 用什么 |
|---|---|
| 外壳 | **Tauri 2**（Rust）—— 单 exe，运行时用系统自带 WebView2 |
| 界面 | **React 19 + TypeScript + Tailwind CSS 4 + motion** |
| 采集 | **PowerShell 5.1**（WMI / CIM / 注册表 / 常见目录扫描） |
| 实时 | **sysinfo** crate（CPU / 内存 / 网络 / 磁盘） |
| 打包 | `tauri build --no-bundle` → 单文件 exe，无安装器 |

## 项目结构

```
hjjc/
├─ src/                     前端（React）
│  ├─ components/pages/     四个页签
│  ├─ components/ui/        玻璃卡 / 评分环 / 曲线 / 状态点…
│  ├─ lib/api.ts            Tauri 调用封装（浏览器里自动退回 mock）
│  ├─ mock/sample.ts        浏览器预览假数据
│  ├─ styles/               tokens.css + app.css（原站设计 tokens）
│  └─ types.ts              数据契约（唯一真相）
├─ src-tauri/
│  ├─ src/                  Rust：scan_all / live_snapshot / 提权 / 写文件
│  └─ scripts/scan.ps1      PowerShell 采集器（核心）
├─ docs/                    数据契约 / 检测项清单 / 参考调研 / 构建打包
├─ scripts/make-icon.py     图标生成
└─ assets/icon-source.png   图标源图
```

## 本地开发

```powershell
# 纯前端预览（浏览器 + mock 数据，改样式最快）
npm install
npm run dev              # http://localhost:1420

# 桌面开发（需要 Rust 工具链 + WebView2）
npm run app:dev

# 出绿色版单文件 exe
npm run app:build        # → src-tauri/target/release/*.exe
```

前置：Node 18+ / Rust stable / WebView2（Win10 1803+ 一般自带）。
国内网络建议给 cargo 配 rsproxy 镜像、npm 用 npmmirror。

## 数据采集说明

- 采集脚本会在 `%TEMP%` 下落地一个临时 `.ps1` 和一个 `.json`，读完即删；**不联网**（除了外网连通性探测那一项）。
- 所有数据只在本机内存里流转，不会上传到任何服务器。导出的报告是你手动触发才写文件。
- 拿不到的字段一律返回 `null` 并在 `meta.warnings` 里说明原因，**不会伪造数据**。

## 借鉴与致谢

产品结构参考了这些开源项目（详见 [docs/参考调研.md](docs/参考调研.md)）：

- [unupunct/SPECS](https://github.com/unupunct/SPECS) —— 单 exe 便携硬件诊断，功能矩阵与评分思路（MIT）
- [rcmaehl/WhyNotWin11](https://github.com/rcmaehl/WhyNotWin11) —— 逐项「通过/不通过 + 原因」的兼容性清单
- [Gexos/System-Info-Dashboard](https://github.com/Gexos/System-Info-Dashboard) —— 轻量看板布局
- [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor) —— 传感器采集思路
- [systeminformation](https://github.com/sebhildebrandt/systeminformation) —— Node 侧硬件信息字段口径

界面设计 tokens 来自同作者的博客项目 [清吾 qingwu.ink](https://qingwu.ink)。

## 许可

MIT © 清吾
