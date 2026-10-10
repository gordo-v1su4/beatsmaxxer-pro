"""
Trace the Beatsmaxxer Pro logo art into SVG paths for the splash.

The splash fills these silhouettes with its own palette, so the letterforms
match the art while the colours stay a CSS knob. Two marks are traced:

  logo-source.webp    the lightning logo (`?logo=bolt`): word, PRO, bolt
  chrome-source.webp  the chrome wordmark (default): word, PRO

Rerun after replacing either image:

    uv run --with opencv-python-headless --with pillow --with numpy python trace.py

Writes ../../src/lib/components/splashLogoPaths.ts.
"""
import numpy as np, cv2
from PIL import Image
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE.parent.parent / 'src/lib/components/splashLogoPaths.ts'


def load(name):
    im = np.array(Image.open(HERE / name).convert('RGB'))
    hsv = cv2.cvtColor(im, cv2.COLOR_RGB2HSV).astype(int)
    return im, hsv[..., 0], hsv[..., 1], hsv[..., 2]


def clean(mask, close=(5, 3)):
    m = mask.astype(np.uint8) * 255
    # Bridge scanline gaps so each letter traces as one shape.
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, close))
    # Soften pixel stair-steps before tracing.
    m = cv2.GaussianBlur(m, (3, 3), 0)
    return (m > 127).astype(np.uint8)


def keep(mask, min_area, band=None):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    out = np.zeros_like(mask)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if area < min_area:
            continue
        if band and (y + h < band[0] or y > band[1]):
            continue
        out[lab == i] = 1
    return out


def to_path(mask, eps=0.9, dx=0, dy=0):
    contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in contours:
        if cv2.contourArea(c) < 12:
            continue
        pts = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
        if len(pts) < 3:
            continue
        parts.append('M' + ' '.join(f'{x - dx} {y - dy}' for x, y in pts) + 'Z')
    return ''.join(parts)


# ---- lightning logo -------------------------------------------------------

def trace_bolt():
    im, H, S, V = load('logo-source.webp')
    yy, xx = np.mgrid[0:im.shape[0], 0:im.shape[1]]
    bright = V > 90
    green = bright & (H >= 36) & (H <= 70) & (S > 90)
    bluish = bright & (H >= 95) & (H <= 150)
    warm = bright & ~green & ~bluish
    pro_box = (xx > 1225) & (xx < 1700) & (yy > 540) & (yy < 660)

    word = keep(clean(warm & ~pro_box), 900, band=(280, 600))
    pro = keep(clean(bright & pro_box, close=(3, 5)), 60)
    bolt = keep(clean(green), 4000)
    # The word hides the bolt's middle in the art, but the splash shows the
    # bolt alone before the word lands. Bridge the two visible halves with the
    # hull of the rows either side of the gap.
    rows = np.zeros_like(bolt)
    rows[230:300] = bolt[230:300]
    rows[540:600] = bolt[540:600]
    pts = cv2.findNonZero(rows)
    if pts is not None:
        cv2.fillConvexPoly(bolt, cv2.convexHull(pts), 1)
    return {'w': 2000, 'h': 848, 'word': to_path(word), 'pro': to_path(pro), 'bolt': to_path(bolt)}


# ---- chrome wordmark ------------------------------------------------------

# The board is cropped to the mark. The katakana line under the bar is left
# out (it is not real Japanese), and the bar and its flare are drawn by the
# splash itself, so only the word and PRO are traced.
CHROME_CROP = (120, 420, 1860, 800)  # x0, y0, x1, y1
WORD_ROWS = (447, 628)
SHEAR = 0.42  # the italic slant, as x per y


def unshear(mask, inverse=False):
    h = mask.shape[0]
    s = -SHEAR if inverse else SHEAR
    m = np.float32([[1, s, -s * h / 2], [0, 1, 0]])
    return cv2.warpAffine(mask, m, (mask.shape[1], h), flags=cv2.INTER_NEAREST)


def gap_centres(upright, lo, hi):
    """Centres of the diamond gaps between neighbouring X glyphs."""
    row = upright[upright.shape[0] // 2]
    centres, start = [], None
    for x in range(lo, hi):
        if row[x] == 0 and start is None:
            start = x
        elif row[x] and start is not None:
            if x - start > 15:
                centres.append((start + x) // 2)
            start = None
    return centres


def trace_chrome():
    im, H, S, V = load('chrome-source.webp')
    y0, y1 = WORD_ROWS
    word = np.zeros(V.shape, np.uint8)
    word[y0:y1] = V[y0:y1] > 60

    # The art spells MAXXXER. Its three X's are copies of one glyph, so
    # cutting from the centre of one diamond gap to the centre of the next,
    # and closing up, removes exactly one X with no seam. Done upright (the
    # slant sheared out) so the cut is a straight column band.
    band = unshear(word[y0:y1])
    a, b = gap_centres(band, 1100, 1520)[:2]
    pitch = b - a
    band = np.concatenate([band[:, :a], band[:, b:], np.zeros((band.shape[0], pitch), np.uint8)], 1)
    word[y0:y1] = unshear(band, inverse=True)

    yy, xx = np.mgrid[0:V.shape[0], 0:V.shape[1]]
    pro_box = (xx > 1385) & (xx < 1830) & (yy > 636) & (yy < 765)
    pro = np.zeros(V.shape, np.uint8)
    pro[pro_box] = V[pro_box] > 60
    # The tail of the word moved left by one glyph; PRO follows it so the
    # pair keeps its relationship.
    pro = np.roll(pro, -pitch, axis=1)

    word = keep(clean(word, close=(3, 3)), 1500)
    pro = keep(clean(pro, close=(3, 5)), 200)

    x0, cy0, x1, cy1 = CHROME_CROP
    return {
        'w': x1 - x0 - pitch,
        'h': cy1 - cy0,
        'word': to_path(word, dx=x0, dy=cy0),
        'pro': to_path(pro, dx=x0, dy=cy0),
        'bolt': '',
    }, word, pro


def main():
    bolt = trace_bolt()
    chrome, cw, cp = trace_chrome()

    dbg = np.zeros((cw.shape[0], cw.shape[1], 3), np.uint8)
    dbg[cw > 0] = (120, 200, 255)
    dbg[cp > 0] = (255, 255, 255)
    Image.fromarray(dbg).save(HERE / 'trace-debug.png')

    def emit(name, d):
        return '\n'.join([
            f'export const {name}: SplashLogo = {{',
            f"  w: {d['w']},",
            f"  h: {d['h']},",
            f"  word: '{d['word']}',",
            f"  pro: '{d['pro']}',",
            f"  bolt: '{d['bolt']}'",
            '};',
        ])

    OUT.write_text('\n'.join([
        '// Generated by svelte/scripts/splash/trace.py. Do not edit.',
        '',
        '/** A traced mark: an art board and its silhouettes in board pixels. */',
        'export interface SplashLogo {',
        '  w: number;',
        '  h: number;',
        '  word: string;',
        '  pro: string;',
        "  /** Empty for marks without a bolt. */",
        '  bolt: string;',
        '}',
        '',
        emit('BOLT_LOGO', bolt),
        '',
        emit('CHROME_LOGO', chrome),
        '',
    ]), encoding='utf-8')
    print('bolt', {k: len(v) for k, v in bolt.items() if isinstance(v, str)})
    print('chrome', chrome['w'], chrome['h'], {k: len(v) for k, v in chrome.items() if isinstance(v, str)})


main()
