"""Draws the screens screen-check recorded, so the OLED layout can be looked
at with no board attached.

It is a sketch of the layout, not a photograph of the panel: the boxes, the
positions and the text widths are the real ones, but the letter shapes are
whatever font this machine has. Use it to see that rows sit where they should
and nothing is cramped. Use the board to see what it really looks like.
"""
from PIL import Image, ImageDraw, ImageFont

SCALE = 5
W, H = 128, 64

def font_for(fid, want_w, text):
    # Pick a size whose drawn width is closest to the real U8g2 advance width,
    # so a row that fits here fits on the panel too.
    sizes = {0: range(20, 31), 1: range(9, 16), 2: range(7, 12)}[fid]
    best, best_err = None, 1e9
    for s in sizes:
        for path in ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
                     "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
            try:
                f = ImageFont.truetype(path, s * SCALE // 1)
            except OSError:
                continue
            w = f.getbbox(text)[2]
            err = abs(w - want_w * SCALE)
            if err < best_err:
                best, best_err = f, err
    return best or ImageFont.load_default()

def draw_state(name, ops):
    img = Image.new("RGB", (W * SCALE, H * SCALE), (8, 10, 20))
    d = ImageDraw.Draw(img)
    ON, OFF = (150, 225, 255), (8, 10, 20)
    for kind, x, y, w, h, fid, color, text in ops:
        ink = ON if color else OFF
        if kind == "box":
            d.rectangle([x*SCALE, y*SCALE, (x+w)*SCALE-1, (y+h)*SCALE-1], fill=ink)
        elif kind == "frame":
            d.rectangle([x*SCALE, y*SCALE, (x+w)*SCALE-1, (y+h)*SCALE-1],
                        outline=ink, width=SCALE)
        elif kind == "pixel":
            d.rectangle([x*SCALE, y*SCALE, (x+1)*SCALE-1, (y+1)*SCALE-1], fill=ink)
        elif kind == "text" and text:
            f = font_for(fid, w, text)
            d.text((x*SCALE, y*SCALE), text, font=f, fill=ink, anchor="ls")
    return img

states, cur = [], None
for line in open("screen-ops.txt"):
    line = line.rstrip("\n")
    if line.startswith("STATE "):
        cur = (line[6:], [])
        states.append(cur)
    elif line and cur:
        p = line.split(" ", 7)
        cur[1].append((p[0], int(p[1]), int(p[2]), int(p[3]), int(p[4]),
                       int(p[5]), int(p[6]), p[7] if len(p) > 7 else ""))

pad, label = 10, 26
cols = 2
rows = (len(states) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (W*SCALE + pad) + pad,
                          rows * (H*SCALE + pad + label) + pad), (26, 26, 30))
sd = ImageDraw.Draw(sheet)
try:
    lf = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 17)
except OSError:
    lf = ImageFont.load_default()

for i, (name, ops) in enumerate(states):
    c, r = i % cols, i // cols
    x = pad + c * (W*SCALE + pad)
    y = pad + r * (H*SCALE + pad + label)
    sd.text((x, y + 4), name, font=lf, fill=(235, 235, 235))
    sheet.paste(draw_state(name, ops), (x, y + label))

sheet.save("screen-preview.png")
print("     drew %d screens to bench/test/screen-preview.png" % len(states))
