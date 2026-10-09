import sys, re
from pathlib import Path
FONT = Path(__file__).resolve().parents[2] / 'app' / 'fonts' / 'bitcount-prop-single-latin.woff2'
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

def load(weight):
    f = TTFont(str(FONT))
    return instantiateVariableFont(f, {'wght': weight})

def text_path(font, text, tracking=0):
    gs = font.getGlyphSet(); cm = font.getBestCmap(); hm = font['hmtx']
    pen = SVGPathPen(gs); x = 0
    for ch in text:
        g = cm[ord(ch)]
        gs[g].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        x += hm[g][0] + tracking
    bp = BoundsPen(gs); x2 = 0
    for ch in text:
        g = cm[ord(ch)]; gs[g].draw(TransformPen(bp, (1, 0, 0, -1, x2, 0))); x2 += hm[g][0] + tracking
    return pen.getCommands(), bp.bounds

if __name__ == '__main__':
    w = float(sys.argv[1]); text = sys.argv[2]
    d, b = text_path(load(w), text)
    print(b); print(d[:600])


def text_dots(font, text, pitch=100):
    from fontTools.pens.pointInsidePen import PointInsidePen
    gs = font.getGlyphSet(); cm = font.getBestCmap(); hm = font['hmtx']
    centers, x = [], 0
    for ch in text:
        name = cm[ord(ch)]
        for row in range(-2, 9):
            for col in range(hm[name][0] // pitch + 1):
                px, py = col * pitch + pitch / 2, row * pitch + pitch / 2
                pen = PointInsidePen(gs, (px, py))
                gs[name].draw(pen)
                if pen.getResult():
                    centers.append((x + px, -py))
        x += hm[name][0]
    return centers, x
