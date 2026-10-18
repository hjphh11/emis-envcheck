"""把 @fontsource 的中文字体裁成「只含本应用实际用到字符」的子集。

为什么做：@fontsource 的 CJK 字体按 unicode-range 切成 174 个子集，
整包塞进 exe 有 12.3MB，而本应用真正用到的汉字不到 1000 个。
子集化后两个字体合计约 100-200KB，exe 体积能从 17.7MB 降到 ~6MB。

安全边界：
- 只裁 ZCOOL XiaoWei（标题）和 Ma Shan Zheng（手写点缀）两套「显示字体」；
  正文用的是系统字体栈（微软雅黑/苹方），不受影响。
- 字符集 = 前端源码里所有字符串 + dev/texts.json（采集器文案）+ 拉丁/标点/符号区段。
- 万一漏了某个字，CSS 里 font-family 还有系统字体兜底，不会显示方块。

用法：python scripts/subset-fonts.py
输出：src/assets/fonts/{zcool-xiaowei,ma-shan-zheng}-subset.woff2
"""

from __future__ import annotations

import json
import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT_DIR = ROOT / "src" / "assets" / "fonts"
OUT_DIR = FONT_DIR

# 字体显示名 -> (源文件, 输出文件名)
FONTS = {
    "ZCOOL XiaoWei": (
        ROOT / "node_modules/@fontsource/zcool-xiaowei/files/zcool-xiaowei-chinese-simplified-400-normal.woff2",
        "zcool-xiaowei-subset.woff2",
    ),
    "Ma Shan Zheng": (
        ROOT / "node_modules/@fontsource/ma-shan-zheng/files/ma-shan-zheng-chinese-simplified-400-normal.woff2",
        "ma-shan-zheng-subset.woff2",
    ),
}

# 无论 UI 文案怎么改都要保留的区段：ASCII、拉丁补充、常用标点/箭头/数学符号、
# CJK 标点、全角字符。
BASE_RANGES = [
    (0x0020, 0x007E),
    (0x00A0, 0x00FF),
    (0x2000, 0x206F),
    (0x20A0, 0x20BF),  # 货币符号
    (0x2100, 0x214F),
    (0x2190, 0x21FF),  # 箭头
    (0x2200, 0x22FF),  # 数学符号
    (0x2460, 0x24FF),  # 带圈数字
    (0x2500, 0x257F),  # 制表符
    (0x25A0, 0x25FF),  # 几何图形
    (0x2600, 0x26FF),  # 杂项符号
    (0x3000, 0x303F),  # CJK 标点
    (0xFF00, 0xFFEF),  # 全角
]

# 额外的固定字符（评分环、状态标记等用到的）
EXTRA = "℃℉•·×÷±≤≥≠→←↑↓★☆✓✗⚠％…—–「」『』【】《》"


def collect_chars() -> tuple[set[str], list[pathlib.Path]]:
    chars: set[str] = set(EXTRA)
    for lo, hi in BASE_RANGES:
        chars.update(chr(cp) for cp in range(lo, hi + 1))

    sources: list[pathlib.Path] = []
    for pattern in ("src/**/*.tsx", "src/**/*.ts", "index.html"):
        sources.extend(ROOT.glob(pattern))

    texts_json = ROOT / "dev" / "texts.json"
    if texts_json.exists():
        sources.append(texts_json)

    for path in sources:
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        chars.update(ch for ch in text if ch not in "\r\n\t")

    return chars, sources


def subset_font(display_name: str, src: pathlib.Path, out_name: str, text: str) -> tuple[int, int]:
    if not src.exists():
        raise SystemExit(f"找不到源字体：{src}（先 npm install）")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / out_name

    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.recalc_bounds = True
    options.drop_tables += ["DSIG"]
    # 保留 hinting（中文小字号下更清晰），代价是略大一点点
    options.hinting = True

    font = TTFont(str(src))
    sub = subset.Subsetter(options=options)
    sub.populate(text=text)
    sub.subset(font)
    font.flavor = "woff2"
    font.save(str(out))
    font.close()

    return src.stat().st_size, out.stat().st_size


def main() -> int:
    chars, sources = collect_chars()
    # 去掉控制字符，排好序方便日志
    clean = "".join(sorted(c for c in chars if c.isprintable() or c in "\u00a0"))
    han = sum(1 for c in clean if "\u4e00" <= c <= "\u9fff")
    print(f"字符集：{len(clean)} 个字符（其中汉字 {han} 个），来源 {len(sources)} 个文件")
    print(f"  UI 源码 + index.html + dev/texts.json")

    total_src = 0
    total_out = 0
    for name, (src, out_name) in FONTS.items():
        before, after = subset_font(name, src, out_name, clean)
        total_src += before
        total_out += after
        print(
            f"  {name:<16} {before / 1024:>8.1f} KB  ->  {after / 1024:>7.1f} KB  "
            f"(省 {100 * (1 - after / before):.1f}%)"
        )

    print(
        f"合计：{total_src / 1024:.1f} KB -> {total_out / 1024:.1f} KB "
        f"(省 {(total_src - total_out) / 1024 / 1024:.2f} MB)"
    )
    if total_out > 900 * 1024:
        print("⚠️ 子集仍然偏大，检查字符集是否误收了整段 CJK 文本", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
