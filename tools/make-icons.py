#!/usr/bin/env python3
"""
アイコン一式を icons/icon-512.png から作り直す。

  python3 -m pip install pillow
  python3 tools/make-icons.py

作るもの
  icons/icon-192.png        any（192）
  icons/icon-512.png        any（512・パレット化して かるくする）
  icons/maskable-192.png    maskable（192）
  icons/maskable-512.png    maskable（512）
  icons/apple-touch-icon.png  iOS 用（180・とうめいを ふくまない）

なぜ maskable を べつに 作るのか
  もとの絵は オレンジの 下地の うえに 白い 角丸カードが のっている。
  maskable は 中央80%の 円で 切りぬかれるため、そのままだと
  カードの 四すみが 欠ける（実測 1.35%。目標は 0.2% 以下）。
  下地は 切りぬかれて よいので 端まで のばし、
  欠けては こまる 中身（白いカードと ブロック）だけを 小さくして 中央に おく。

  下地を のばす とき、単色で ぬると 角丸四角の りんかくが
  うすい 影として のこる（もとの 下地は 左上が 明るく 右下が 暗い ため）。
  そこで 外周の 画素から グラデーションを 当てはめ、その式で 全面を ぬる。
"""

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow が いります:  python3 -m pip install pillow")

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
SRC = ICONS / "icon-512.png"

# 中身と 下地を わける しきい値（RGB の 差の 合計）
CONTENT_THRESHOLD = 45
# maskable の セーフゾーン（中央80%の 円）に対する よゆう
SAFE_MARGIN = 0.96


def fit_background(im):
    """外周の 画素から r,g,b = a + b*x + c*y を 当てはめ、下地の 式を 返す。"""
    import numpy as np

    w, h = im.size
    arr = np.asarray(im, dtype=np.float64)
    ys, xs = np.mgrid[0:h, 0:w]
    edge = (xs < 4) | (xs >= w - 4) | (ys < 4) | (ys >= h - 4)
    X = np.stack([np.ones(edge.sum()), xs[edge], ys[edge]], axis=1)
    coef = [np.linalg.lstsq(X, arr[:, :, c][edge], rcond=None)[0] for c in range(3)]
    return coef


def render_background(coef, size):
    import numpy as np

    ys, xs = np.mgrid[0:size, 0:size]
    # 512 で 当てはめた 式を、ほかの 大きさでも 同じ 見た目に する
    s = 512.0 / size
    chans = [np.clip(c[0] + c[1] * xs * s + c[2] * ys * s, 0, 255) for c in coef]
    return Image.fromarray(np.stack(chans, axis=2).astype("uint8"), "RGB")


def content_mask(im, coef):
    """下地の 式から はなれている 画素＝欠けては こまる 中身。"""
    import numpy as np

    w, h = im.size
    arr = np.asarray(im, dtype=np.float64)
    ys, xs = np.mgrid[0:h, 0:w]
    diff = sum(abs(arr[:, :, c] - (coef[c][0] + coef[c][1] * xs + coef[c][2] * ys)) for c in range(3))
    return (diff > CONTENT_THRESHOLD)


def build_maskable(src, size):
    import numpy as np

    coef = fit_background(src)
    mask = content_mask(src, coef)
    w, h = src.size
    ys, xs = np.mgrid[0:h, 0:w]
    cx, cy = w / 2.0, h / 2.0
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    max_dist = dist[mask].max()
    safe_r = w * 0.4 * SAFE_MARGIN
    scale = min(1.0, safe_r / max_dist)

    # 中身だけを ぬき出す（下地は のちほど 全面に ぬるので いらない）
    rgba = src.convert("RGBA")
    a = np.asarray(rgba).copy()
    a[:, :, 3] = np.where(mask, 255, 0)
    content = Image.fromarray(a, "RGBA")

    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    content = content.resize((nw, nh), Image.LANCZOS)

    out = render_background(coef, w).convert("RGBA")
    out.alpha_composite(content, ((w - nw) // 2, (h - nh) // 2))
    out = out.convert("RGB")
    if size != w:
        out = out.resize((size, size), Image.LANCZOS)
    return out


def save_small(im, path, budget_kb=60):
    """じょうげんに おさまる はんいで、いちばん 色数の 多い 版を えらぶ。

    ただ「いちばん かるい版」を えらぶと 48色まで おちて、
    オレンジの グラデーションに はっきりした しま（バンディング）が 出る。
    上限（512 は 60KB、favicon は 30KB）には じゅうぶん よゆうが あるので、
    おさまる うちで いちばん きれいな ものを とる。
    """
    import io

    for n in (256, 192, 128, 96, 64):
        p = im.convert("P", palette=Image.ADAPTIVE, colors=n)
        buf = io.BytesIO()
        p.save(buf, format="PNG", optimize=True)
        if buf.tell() <= budget_kb * 1024 or n == 64:
            path.write_bytes(buf.getvalue())
            return buf.tell()


def main():
    if not SRC.exists():
        sys.exit(f"{SRC} が ありません")
    src = Image.open(SRC).convert("RGB")
    if src.size != (512, 512):
        src = src.resize((512, 512), Image.LANCZOS)

    made = []
    # any（もとの絵の まま）
    made.append(("icon-512.png", save_small(src, ICONS / "icon-512.png")))
    made.append(("icon-192.png", save_small(src.resize((192, 192), Image.LANCZOS), ICONS / "icon-192.png")))

    # maskable（中身を セーフゾーンに おさめ、下地を 端まで のばす）
    m512 = build_maskable(src, 512)
    made.append(("maskable-512.png", save_small(m512, ICONS / "maskable-512.png")))
    made.append(("maskable-192.png", save_small(build_maskable(src, 192), ICONS / "maskable-192.png")))

    # iOS 用。とうめいを ふくまない（ふくむと ホーム画面で 四すみが 黒くなる）
    apple = src.resize((180, 180), Image.LANCZOS)
    made.append(("apple-touch-icon.png", save_small(apple, ICONS / "apple-touch-icon.png")))

    for name, size in made:
        print(f"  {name:24s} {size/1024:7.1f} KB")


if __name__ == "__main__":
    main()
