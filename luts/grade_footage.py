import numpy as np
from pathlib import Path
import build_luts as L

N = 65
OUT = Path(__file__).parent


def grid(n):
    r = np.linspace(0, 1, n)
    B, G, R = np.meshgrid(r, r, r, indexing='ij')
    return np.stack([R, G, B], -1).reshape(-1, 3)


def match(rgb, look_strength=0.70, pivot=0.28):
    rgb = np.clip(rgb, 0, 1)
    Y = L.luma(rgb)
    mx = rgb.max(-1)
    t = (rgb[..., 0] - rgb[..., 2]) / np.maximum(mx, 0.03)

    warm = L.smooth(t, 0.06, 0.30)
    sat = (mx - rgb.min(-1)) / np.maximum(mx, 0.03)
    cool = (1 - L.smooth(t, 0.0, 0.16)) * (1 - L.smooth(Y, 0.26, 0.42)) * (1 - L.smooth(sat, 0.22, 0.42))
    skin = warm * L.smooth(Y, 0.04, 0.22)

    rgb = rgb * (1.35 + 0.35 * skin)[..., None]

    Yc = L.luma(rgb)[..., None]
    steel = Yc * np.array([0.95, 0.99, 1.06])
    w = (cool * 0.85)[..., None]
    rgb = rgb * (1 - w) + steel * w
    rgb = rgb * (1 - 0.40 * cool * L.smooth(Y, 0.04, 0.20))[..., None]

    Y = L.luma(rgb)
    rgb = rgb * (0.80 + 0.20 * L.smooth(Y, 0.0, 0.12))[..., None]

    return L.look(np.clip(rgb, 0, 1), look_strength, pivot)


def wall_mask(rgb):
    Y = L.luma(rgb)
    mx = rgb.max(-1)
    t = (rgb[..., 0] - rgb[..., 2]) / np.maximum(mx, 0.03)
    sat = (mx - rgb.min(-1)) / np.maximum(mx, 0.03)
    return (1 - L.smooth(t, 0.0, 0.10)) * (1 - L.smooth(Y, 0.30, 0.40)) * (1 - L.smooth(sat, 0.18, 0.30)) * L.smooth(Y, 0.08, 0.14)


def caption_mask(rgb):
    h, s, v = L.rgb_to_hsv(rgb)
    mn = rgb.min(-1)
    white = L.smooth(mn, 0.80, 0.88) * (1 - L.smooth(s, 0.08, 0.16))
    lime = L.bell(h, 68, 22) * L.smooth(s, 0.30, 0.42) * L.smooth(v, 0.68, 0.80)
    return np.clip(white + lime, 0, 1)


def write(name, title, data, n):
    with open(OUT / name, 'w') as f:
        f.write(f'TITLE "{title}"\nLUT_3D_SIZE {n}\nDOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n')
        np.savetxt(f, data, fmt='%.6f')


if __name__ == '__main__':
    g = grid(N)
    write('AliTech_Match_Footage.cube', 'AliTech Match Footage', match(g), N)
    m = caption_mask(g)
    write('caption_mask.cube', 'caption mask', np.stack([m, m, m], -1), N)
    w = wall_mask(g)
    write('wall_mask.cube', 'wall mask', np.stack([w, w, w], -1), N)
    W, H = 1080, 1920
    y, x = np.mgrid[0:H, 0:W]
    d = np.sqrt(((x / W - 0.5) / 0.62) ** 2 + ((y / H - 0.40) / 0.60) ** 2)
    vig = 1 - 0.45 * L.smooth(d, 0.35, 1.35)
    from PIL import Image
    Image.fromarray((vig * 255).round().astype('uint8')).save(OUT / 'vignette_1080x1920.png')
    print('done')
