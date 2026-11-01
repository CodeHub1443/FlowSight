#!/usr/bin/env python3
"""Colour table: docs/reference/video/ui-ref-key.png against a 1920x1080 light /live screenshot (Task 13).

    python docs/reference/sample-colours.py docs/screens/t13-light-en-1920x1080.png [more.png ...]

Each region is a small flat patch, read as a per-channel median so a stray pixel does not count. Yellow takes the most
saturated pixels of its patch and dashes the brightest, because those marks are thinner than a patch. deltaE is CIE76.
Regions are positions in the frozen hero view, so they only hold for the default camera at 1920x1080.
"""
import sys

import numpy as np
from PIL import Image

REFERENCE = 'docs/reference/video/ui-ref-key.png'
# name: (mode, reference patches, our patches); a patch is the centre (x, y), 13 x 13 px
REGIONS = {
    'ground': ('median', [(250, 600), (60, 540)], [(160, 760), (130, 700)]),
    'aisle / road band': ('median', [(150, 700), (60, 650), (350, 200)], [(800, 700), (600, 850)]),
    'zone plate': ('median', [(930, 600), (800, 510), (860, 720)], [(450, 800), (620, 720), (1060, 540)]),
    'lane dash': ('bright', [(342, 472), (232, 256), (705, 680)], [(770, 752), (660, 807)]),
    'yellow outline': ('yellow', [(893, 571), (1025, 548), (973, 611)], [(275, 755), (485, 795), (630, 695)]),
    'void / top area': ('median', [(780, 50), (250, 60)], [(1700, 300), (700, 180), (150, 200)]),
    'top bar': ('median', [(800, 8), (780, 50)], [(800, 25), (1100, 25)]),
    'card': ('median', [(240, 110), (1420, 140)], [(250, 145), (540, 145), (1700, 660)]),
}
R = 6
LINE_R = 20


def lab(rgb):
    c = np.asarray(rgb, dtype=float) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = m @ c / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])


def read(a, patches, mode):
    out = []
    for x, y in patches:
        r = LINE_R if mode == 'yellow' else R
        p = a[max(y - r, 0) : y + r + 1, max(x - r, 0) : x + r + 1].reshape(-1, 3).astype(float)
        if mode == 'bright':
            p = p[p.sum(axis=1) >= np.percentile(p.sum(axis=1), 90)]
        elif mode == 'yellow':
            sat = p[:, 0] - p[:, 2]
            p = p[sat >= np.percentile(sat, 98)]
        out.append(np.median(p, axis=0))
    return np.median(np.array(out), axis=0)


def hexa(rgb):
    return '#%02X%02X%02X' % tuple(int(round(v)) for v in rgb)


ref = np.asarray(Image.open(REFERENCE).convert('RGB'))
for path in sys.argv[1:]:
    ours = np.asarray(Image.open(path).convert('RGB'))
    print(f'\n{path}\n| Region | Reference | Ours | deltaE |\n|---|---|---|---|')
    for name, (mode, rp, op) in REGIONS.items():
        r, o = read(ref, rp, mode), read(ours, op, mode)
        print(f'| {name} | {hexa(r)} | {hexa(o)} | {np.linalg.norm(lab(r) - lab(o)):.1f} |')
