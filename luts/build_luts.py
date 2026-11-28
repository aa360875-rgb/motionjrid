import numpy as np
from pathlib import Path

N = 33
OUT = Path(__file__).parent


def luma(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def rgb_to_hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1)
    mn = rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm = m & (mx == r)
    gm = m & (mx == g) & ~rm
    bm = m & ~rm & ~gm
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    h = h * 60.0
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h, s, mx


def hsv_to_rgb(h, s, v):
    h = (h % 360) / 60.0
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p = v * (1 - s)
    q = v * (1 - s * f)
    t = v * (1 - s * (1 - f))
    choices = [
        np.stack([v, t, p], -1), np.stack([q, v, p], -1), np.stack([p, v, t], -1),
        np.stack([p, q, v], -1), np.stack([t, p, v], -1), np.stack([v, p, q], -1),
    ]
    out = np.zeros(h.shape + (3,))
    for k in range(6):
        out[i == k] = choices[k][i == k]
    return out


def bell(h, center, width):
    d = np.abs(((h - center + 180) % 360) - 180)
    return np.clip(1 - d / width, 0, 1) ** 2


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def tone(x, black, shoulder, contrast, pivot=0.42):
    x = np.clip((x - black) / (1 - black), 0, None)
    x = x ** 1.08
    lo = pivot * (x / pivot) ** contrast
    hi = 1 - (1 - pivot) * ((1 - np.minimum(x, 1)) / (1 - pivot)) ** contrast
    y = np.where(x < pivot, lo, hi)
    y = np.where(x > 1, 1, y)
    return y * shoulder


def look(rgb, strength, pivot=0.42):
    s = strength
    rgb = np.clip(rgb, 0, 1)

    rgb = rgb * (1 - 0.03 * s)

    h, sat, v = rgb_to_hsv(rgb)
    w_green = bell(h, 115, 55)
    w_cyan = bell(h, 190, 45)
    w_blue = bell(h, 220, 45)
    w_skin = bell(h, 22, 28)
    w_mag = bell(h, 300, 50)
    h = h - 18 * s * w_green + 12 * s * bell(h, 245, 35) - 6 * s * w_cyan
    sat = sat * (1 - 0.42 * s * w_green) * (1 - 0.30 * s * w_cyan) * (1 - 0.22 * s * w_blue) * (1 - 0.40 * s * w_mag)
    sat = sat * (1 + 0.18 * s * w_skin)
    sat = sat * (1 - 0.05 * s)
    rgb = hsv_to_rgb(h, np.clip(sat, 0, 1), v)

    black = 0.035 * s
    contrast = 1 + 0.38 * s
    shoulder = 1 - 0.035 * s
    Y0 = luma(rgb)
    Y1 = tone(Y0, black, shoulder, contrast, pivot)
    ratio = np.where(Y0 > 1e-5, Y1 / np.maximum(Y0, 1e-5), 0)[..., None]
    mapped = rgb * ratio
    per_ch = tone(rgb, black, shoulder, contrast, pivot)
    rgb = mapped * 0.65 + per_ch * 0.35

    Y = luma(rgb)
    w_sh = smooth(Y, 0.0, 0.08) * (1 - smooth(Y, 0.12, 0.45))
    w_hi = smooth(Y, 0.30, 0.85)
    cool = np.array([-0.012, 0.002, 0.016])
    warm = np.array([0.034, 0.008, -0.030])
    rgb = rgb + s * (w_sh[..., None] * cool + w_hi[..., None] * warm)

    rgb = rgb + s * w_hi[..., None] * 0
    return np.clip(rgb, 0, 1)


def applelog_to_lin(p):
    R0, Rt, c, b, g, be = -0.05641088, 0.01, 47.28711236, 0.00964052, 0.08550479, 0.69336945
    Pt = c * (Rt - R0) ** 2
    hi = 2 ** ((p - be) / g) - b
    lo = np.sqrt(np.clip(p, 0, None) / c) + R0
    return np.where(p >= Pt, hi, np.where(p > 0, lo, R0))


M2020_709 = np.array([
    [1.6605, -0.5876, -0.0728],
    [-0.1246, 1.1329, -0.0083],
    [-0.0182, -0.1006, 1.1187],
])


def applelog_to_display(rgb):
    lin = applelog_to_lin(rgb)
    lin = np.einsum('ij,...j->...i', M2020_709, lin)
    lin = np.clip(lin, 0, None) * 0.9
    x = lin
    tm = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
    return np.clip(tm, 0, 1) ** (1 / 2.2)


def grid():
    r = np.linspace(0, 1, N)
    B, G, R = np.meshgrid(r, r, r, indexing='ij')
    return np.stack([R, G, B], -1).reshape(-1, 3)


def write(name, title, data):
    path = OUT / name
    with open(path, 'w') as f:
        f.write(f'TITLE "{title}"\n')
        f.write(f'LUT_3D_SIZE {N}\n')
        f.write('DOMAIN_MIN 0.0 0.0 0.0\nDOMAIN_MAX 1.0 1.0 1.0\n\n')
        for p in data:
            f.write(f'{p[0]:.6f} {p[1]:.6f} {p[2]:.6f}\n')
    return path


if __name__ == '__main__':
    g = grid()
    write('AliTech_Moody_Rec709.cube', 'AliTech Moody Rec709', look(g, 1.0))
    write('AliTech_Moody_Soft_Rec709.cube', 'AliTech Moody Soft Rec709', look(g, 0.55))
    write('AliTech_Moody_AppleLog.cube', 'AliTech Moody AppleLog', look(applelog_to_display(g), 1.0))
    write('AliTech_Moody_Soft_AppleLog.cube', 'AliTech Moody Soft AppleLog', look(applelog_to_display(g), 0.55))
    print('done')
