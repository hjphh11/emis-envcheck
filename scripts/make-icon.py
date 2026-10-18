"""生成「爱弥斯 · 环境检测」应用图标源图（1024×1024 PNG）。

设计：暖色渐变圆角方 + 白色心形（健康）+ 绯红心跳线（检测）+ 星芒（爱弥斯的琥珀金）。
只用 Pillow，不引外部资源。生成后用 `npx tauri icon assets/icon-source.png` 出全套尺寸。
"""

import math
import os

from PIL import Image, ImageDraw, ImageFilter

S = 1024
SS = 4  # 超采样倍数，最后缩回去做抗锯齿

# 爱弥斯色板
CRIMSON = (194, 58, 85)
ROSE = (246, 165, 184)
AMBER = (232, 176, 75)
CREAM = (253, 246, 240)


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_bg(size):
    """对角三段渐变：绯红 → 玫瑰粉 → 琥珀金。"""
    w = h = size
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / (w - 1) * 0.45) + (y / (h - 1) * 0.55)
            if t < 0.5:
                c = lerp(CRIMSON, ROSE, t / 0.5)
            else:
                c = lerp(ROSE, AMBER, (t - 0.5) / 0.5)
            px[x, y] = c
    return img


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def heart_points(cx, cy, scale, n=720):
    """标准心形参数曲线。"""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * scale, cy - y * scale))
    return pts


def sparkle(draw, cx, cy, r, color, alpha):
    """四角星芒。"""
    draw.polygon(
        [
            (cx, cy - r),
            (cx + r * 0.22, cy - r * 0.22),
            (cx + r, cy),
            (cx + r * 0.22, cy + r * 0.22),
            (cx, cy + r),
            (cx - r * 0.22, cy + r * 0.22),
            (cx - r, cy),
            (cx - r * 0.22, cy - r * 0.22),
        ],
        fill=color + (alpha,),
    )


def main():
    size = S * SS
    u = size / 1024.0  # 相对 1024 的缩放系数

    # 1) 渐变底 + 圆角
    bg = gradient_bg(size)
    mask = rounded_mask(size, radius=int(224 * u))
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    icon.paste(bg, (0, 0), mask)

    # 2) 左上柔光，让玻璃质感出来
    glow = Image.new("L", (size, size), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-size * 0.35, -size * 0.45, size * 0.75, size * 0.55], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.09))
    white = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    icon = Image.composite(white, icon, glow.point(lambda v: int(v * 0.55)))
    icon.putalpha(Image.composite(Image.new("L", (size, size), 255), icon.getchannel("A"), mask))

    # 3) 白色心形（健康）
    heart_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(heart_layer)
    hd.polygon(heart_points(size / 2, size * 0.505, 17.2 * u), fill=(255, 255, 255, 242))
    icon = Image.alpha_composite(icon, heart_layer)

    # 4) 心跳线（检测）—— 直接压在心上，绯红，圆头
    pulse = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pulse)
    cy = size * 0.47
    w = int(26 * u)
    lm = size * 0.20
    rm = size * 0.80
    pts = [
        (lm, cy),
        (lm + (rm - lm) * 0.20, cy),
        (lm + (rm - lm) * 0.30, cy - 74 * u),
        (lm + (rm - lm) * 0.42, cy + 88 * u),
        (lm + (rm - lm) * 0.54, cy),
        (rm, cy),
    ]
    pd.line(pts, fill=CRIMSON + (255,), width=w, joint="curve")
    # 圆头端点
    for p in (pts[0], pts[-1]):
        pd.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=CRIMSON + (255,))
    icon = Image.alpha_composite(icon, pulse)

    # 5) 星芒点缀（琥珀金 + 白）
    sp = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sp)
    sparkle(sd, size * 0.795, size * 0.225, 62 * u, (255, 255, 255), 220)
    sparkle(sd, size * 0.215, size * 0.788, 40 * u, AMBER, 235)
    sparkle(sd, size * 0.845, size * 0.775, 26 * u, (255, 255, 255), 170)
    icon = Image.alpha_composite(icon, sp)

    # 6) 缩回 1024 抗锯齿
    icon = icon.resize((S, S), Image.LANCZOS)

    out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "icon-source.png")
    icon.save(out, "PNG")
    print(f"OK -> {out}  ({os.path.getsize(out) / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
