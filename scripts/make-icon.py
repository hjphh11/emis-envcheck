"""生成「爱弥斯 · 环境检测」应用图标源图（1024×1024 PNG），v2：以爱弥斯头像为主。

素材：博客站点的爱弥斯立绘 `full.png`（2658×4096），裁头部 → 圆形头像 → 暖色渐变圆角方底。
产出：assets/icon-source.png，再用 `npx tauri icon assets/icon-source.png` 出全套尺寸。

设计意图：
- 一眼认得出是爱弥斯（粉发 + 琥珀金眼睛），但不堆细节；
- 底色仍是站点那套暖色（玫瑰粉 → 绯红 → 琥珀），和 UI 统一；
- 加一圈白色描边 + 内侧柔光，让 32/48px 的小尺寸下轮廓依然清楚。
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw, ImageFilter

S = 1024

ROSE = (246, 165, 184)
CRIMSON = (194, 58, 85)
AMBER = (232, 176, 75)
CREAM = (253, 246, 240)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC_ART = r"D:\zm\gerbok\public\images\emis\full.png"

# 头部区域（在原图 2658×4096 坐标系里）—— 略宽于脸部，留头发和肩线
HEAD_BOX = (1040, 130, 1720, 830)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_bg(size):
    """对角三段渐变：玫瑰粉 → 绯红 → 琥珀金（比 v1 更柔，让头像跳出来）。"""
    img = Image.new("RGB", (size, size))
    px = img.load()
    w = h = size
    for y in range(h):
        for x in range(w):
            t = (x / (w - 1) * 0.5) + (y / (h - 1) * 0.5)
            if t < 0.45:
                c = lerp(ROSE, CRIMSON, t / 0.45)
            else:
                c = lerp(CRIMSON, AMBER, (t - 0.45) / 0.55)
            px[x, y] = c
    return img


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def circle_avatar(size):
    """裁头部 → 正方形 → 圆形，返回 RGBA。"""
    art = Image.open(SRC_ART).convert("RGBA")
    head = art.crop(HEAD_BOX)

    # 保持正方形：以短边为基准居中裁切
    w, h = head.size
    side = min(w, h)
    left = (w - side) // 2
    top = int((h - side) * 0.22)  # 略微偏向头顶，保留眼睛
    head = head.crop((left, top, left + side, top + side))

    head = head.resize((size, size), Image.LANCZOS)

    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, size - 1, size - 1], fill=255)
    # 边缘羽化 2px，避免锯齿
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))

    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(head, (0, 0), mask)
    return out


def sparkle(draw, cx, cy, r, color, alpha):
    draw.polygon(
        [
            (cx, cy - r),
            (cx + r * 0.2, cy - r * 0.2),
            (cx + r, cy),
            (cx + r * 0.2, cy + r * 0.2),
            (cx, cy + r),
            (cx - r * 0.2, cy + r * 0.2),
            (cx - r, cy),
            (cx - r * 0.2, cy - r * 0.2),
        ],
        fill=color + (alpha,),
    )


def main():
    # 1) 圆角渐变底
    bg = gradient_bg(S)
    mask = rounded_mask(S, radius=int(S * 0.235))
    icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)

    # 2) 左上柔光，玻璃质感
    glow = Image.new("L", (S, S), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-S * 0.3, -S * 0.42, S * 0.7, S * 0.5], fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.1))
    white = Image.new("RGBA", (S, S), (255, 255, 255, 255))
    icon = Image.composite(white, icon, glow.point(lambda v: int(v * 0.5)))
    icon.putalpha(Image.composite(Image.new("L", (S, S), 255), icon.getchannel("A"), mask))

    # 3) 头像：占画面 74%，圆心略偏上
    avatar_d = int(S * 0.74)
    avatar = circle_avatar(avatar_d)
    ax = (S - avatar_d) // 2
    ay = int(S * 0.5 - avatar_d * 0.52)

    #    3a) 头像外圈的柔光阴影
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    pad = int(S * 0.012)
    sd.ellipse(
        [ax - pad, ay - pad + S * 0.012, ax + avatar_d + pad, ay + avatar_d + pad + S * 0.012],
        fill=(120, 20, 40, 90),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(S * 0.028))
    icon = Image.alpha_composite(icon, shadow)

    #    3b) 白色描边环
    ring_w = int(S * 0.022)
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse(
        [ax - ring_w, ay - ring_w, ax + avatar_d + ring_w, ay + avatar_d + ring_w],
        fill=(255, 255, 255, 236),
    )
    icon = Image.alpha_composite(icon, ring)
    icon.alpha_composite(avatar, dest=(ax, ay))

    # 4) 右下角琥珀金星芒 + 左下小白点（克制点缀）
    sp = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    spd = ImageDraw.Draw(sp)
    sparkle(spd, S * 0.795, S * 0.795, S * 0.072, AMBER, 255)
    sparkle(spd, S * 0.865, S * 0.715, S * 0.032, (255, 255, 255), 220)
    icon = Image.alpha_composite(icon, sp)

    out = os.path.join(ROOT, "assets", "icon-source.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    icon.save(out, "PNG")
    print(f"OK -> {out} ({os.path.getsize(out) / 1024:.1f} KB)")

    # 顺带出一张小尺寸预览，方便肉眼检查 32/48px 下认不认得出
    small = icon.resize((256, 256), Image.LANCZOS)
    strip = Image.new("RGBA", (256 + 128 + 64 + 32 + 30, 256), (253, 246, 240, 255))
    x = 0
    for size in (256, 128, 64, 32):
        strip.paste(icon.resize((size, size), Image.LANCZOS), (x, 0), icon.resize((size, size), Image.LANCZOS))
        x += size + 10
    strip.save(os.path.join(ROOT, "dev", "icon-sizes.png"), "PNG")
    print("预览 -> dev/icon-sizes.png")


if __name__ == "__main__":
    main()
