import colorsys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
AD_DIR = Path(__file__).resolve().parent
CAPTURE = ROOT / "marketing" / "captures" / "tradehelp-production-trade-mode.png"
BACKGROUND = AD_DIR / "tradehelp-amber-background-v1.png"
ICON = ROOT / "build" / "icon.png"
OUTPUT = AD_DIR / "tradehelp-meta-instagram-safe-v2.png"

W, H = 1080, 1350
BG = "#0E1117"
SURFACE = "#151B26"
SURFACE_2 = "#1C2433"
LINE = "#2A3344"
TEXT = "#E6EAF2"
DIM = "#8A94A6"
FAINT = "#5A6478"
AMBER = "#F5B642"
AMBER_SOFT = "#3A3018"


def font(name: str, size: int):
    fonts = Path("C:/Windows/Fonts")
    candidates = {
        "black": ["seguibl.ttf", "arialbd.ttf"],
        "bold": ["seguisb.ttf", "arialbd.ttf"],
        "regular": ["segoeui.ttf", "arial.ttf"],
    }[name]
    for candidate in candidates:
        path = fonts / candidate
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    image = image.convert("RGB")
    scale = max(size[0] / image.width, size[1] / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
    left = (resized.width - size[0]) // 2
    top = (resized.height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def recolor_terminal_to_classic(image: Image.Image) -> Image.Image:
    # This maps the real Terminal Green capture onto another real in-app preset:
    # TradeHelp Classic. Geometry, labels, and feature content are left untouched.
    source = [
        (6, 16, 11), (11, 23, 16), (16, 35, 24), (32, 64, 45),
        (231, 255, 240), (138, 185, 155), (86, 122, 99), (134, 239, 172),
    ]
    target = [
        (14, 17, 23), (21, 27, 38), (28, 36, 51), (42, 51, 68),
        (230, 234, 242), (138, 148, 166), (90, 100, 120), (245, 182, 66),
    ]
    src = image.convert("RGB")
    out = Image.new("RGB", src.size)
    result = []
    for r, g, b in src.getdata():
        hue, saturation, value = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        # The selected screenshot was taken with the optional Terminal Green
        # preset. Convert its remaining green accent pixels to Classic amber.
        if 0.22 <= hue <= 0.50 and saturation >= 0.16 and value >= 0.18:
            nr, ng, nb = colorsys.hsv_to_rgb(0.112, min(0.82, saturation), value)
            result.append((round(nr * 255), round(ng * 255), round(nb * 255)))
            continue
        distances = [((r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2) for sr, sg, sb in source]
        index = min(range(len(distances)), key=distances.__getitem__)
        distance = distances[index] ** 0.5
        if distance < 74:
            sr, sg, sb = source[index]
            tr, tg, tb = target[index]
            residual = 0.28
            result.append((
                max(0, min(255, round(tr + (r - sr) * residual))),
                max(0, min(255, round(tg + (g - sg) * residual))),
                max(0, min(255, round(tb + (b - sb) * residual))),
            ))
        else:
            result.append((r, g, b))
    out.putdata(result)
    return out


def rounded_image(image: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, image.width, image.height), radius=radius, fill=255)
    rgba = image.convert("RGBA")
    rgba.putalpha(mask)
    return rgba


def draw_logo(canvas: Image.Image, draw: ImageDraw.ImageDraw):
    icon = Image.open(ICON).convert("RGBA").resize((58, 58), Image.Resampling.LANCZOS)
    canvas.alpha_composite(icon, (58, 48))
    draw.text((132, 54), "Trade", fill=TEXT, font=font("black", 36))
    trade_width = draw.textlength("Trade", font=font("black", 36))
    draw.text((132 + round(trade_width), 54), "Help", fill=AMBER, font=font("black", 36))
    label_font = font("bold", 15)
    label = "DESKTOP JOURNAL"
    label_w = round(draw.textlength(label, font=label_font)) + 30
    x = W - 58 - label_w
    draw.rounded_rectangle((x, 58, x + label_w, 94), radius=18, fill=(28, 36, 51, 220), outline=LINE, width=1)
    draw.text((x + 15, 66), label, fill=DIM, font=label_font)


def draw_feature(draw: ImageDraw.ImageDraw, x: int, width: int, title: str, detail: str):
    draw.rounded_rectangle((x, 1040, x + width, 1125), radius=16, fill=(21, 27, 38, 232), outline=LINE, width=2)
    draw.ellipse((x + 18, 1060, x + 28, 1070), fill=AMBER)
    draw.text((x + 40, 1051), title, fill=TEXT, font=font("bold", 18))
    draw.text((x + 40, 1080), detail, fill=DIM, font=font("regular", 14))


def render():
    canvas = cover(Image.open(BACKGROUND), (W, H)).convert("RGBA")

    # Keep the texture subordinate to the authentic UI and copy.
    wash = Image.new("RGBA", (W, H), (5, 7, 10, 82))
    canvas = Image.alpha_composite(canvas, wash)
    top_fade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fade_draw = ImageDraw.Draw(top_fade)
    for y in range(H):
        edge = max(0.0, 1.0 - min(y, H - y) / 240)
        fade_draw.line((0, y, W, y), fill=(3, 5, 8, round(118 * edge)))
    canvas = Image.alpha_composite(canvas, top_fade)
    draw = ImageDraw.Draw(canvas)

    draw_logo(canvas, draw)

    draw.text((58, 144), "YOUR PROCESS.", fill=TEXT, font=font("black", 58))
    draw.text((58, 207), "ON YOUR MACHINE.", fill=AMBER, font=font("black", 58))
    draw.text((58, 286), "Real-chart review, Trade Mode guardrails, and optional offline AI—", fill=TEXT, font=font("regular", 22))
    draw.text((58, 317), "inside one local-first desktop journal.", fill=DIM, font=font("regular", 22))

    # A real TradeHelp Trade Mode crop. Only the supported color preset changes.
    capture = Image.open(CAPTURE).convert("RGB").crop((35, 245, 779, 637))
    capture = recolor_terminal_to_classic(capture)
    capture = capture.resize((936, 493), Image.Resampling.LANCZOS)

    frame_x, frame_y, frame_w, frame_h = 56, 378, 968, 626
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((frame_x + 4, frame_y + 18, frame_x + frame_w + 4, frame_y + frame_h + 18), radius=26, fill=(0, 0, 0, 168))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    canvas = Image.alpha_composite(canvas, shadow)
    draw = ImageDraw.Draw(canvas)

    draw.rounded_rectangle((frame_x, frame_y, frame_x + frame_w, frame_y + frame_h), radius=24, fill=SURFACE, outline=(245, 182, 66, 120), width=2)
    draw.ellipse((frame_x + 24, frame_y + 22, frame_x + 36, frame_y + 34), fill="#FB7185")
    draw.ellipse((frame_x + 44, frame_y + 22, frame_x + 56, frame_y + 34), fill=AMBER)
    draw.ellipse((frame_x + 64, frame_y + 22, frame_x + 76, frame_y + 34), fill="#34D399")
    draw.text((frame_x + 94, frame_y + 16), "TradeHelp  /  Trade Mode", fill=DIM, font=font("bold", 17))
    badge = "REAL TRADEHELP UI · CLASSIC THEME"
    badge_font = font("bold", 13)
    badge_w = round(draw.textlength(badge, font=badge_font)) + 24
    badge_x = frame_x + frame_w - badge_w - 22
    draw.rounded_rectangle((badge_x, frame_y + 14, badge_x + badge_w, frame_y + 42), radius=14, fill=AMBER_SOFT, outline=(245, 182, 66, 120), width=1)
    draw.text((badge_x + 12, frame_y + 20), badge, fill=AMBER, font=badge_font)
    draw.line((frame_x, frame_y + 58, frame_x + frame_w, frame_y + 58), fill=LINE, width=2)

    capture = rounded_image(capture, 14)
    canvas.alpha_composite(capture, (frame_x + 16, frame_y + 74))
    draw = ImageDraw.Draw(canvas)

    card_w = 300
    draw_feature(draw, 56, card_w, "Real-chart review", "Imported candles + levels")
    draw_feature(draw, 390, card_w, "Trade Mode", "Checklist + max-loss alarm")
    draw_feature(draw, 724, card_w, "Optional local AI", "Ollama or your own key")

    cta_x, cta_y, cta_w, cta_h = 56, 1158, 968, 90
    draw.rounded_rectangle((cta_x, cta_y, cta_x + cta_w, cta_y + cta_h), radius=22, fill=AMBER)
    cta = "START THE 14-DAY FREE TRIAL  →"
    cta_font = font("black", 28)
    cta_text_w = draw.textlength(cta, font=cta_font)
    draw.text((cta_x + (cta_w - cta_text_w) / 2, cta_y + 25), cta, fill="#17120A", font=cta_font)

    offer = "ONE-TIME PURCHASE  ·  NO SUBSCRIPTION  ·  WINDOWS, MACOS & LINUX"
    offer_font = font("bold", 14)
    offer_w = draw.textlength(offer, font=offer_font)
    draw.text(((W - offer_w) / 2, 1270), offer, fill=DIM, font=offer_font)

    disclaimer = "Trading involves risk. Journaling tool only—not financial advice. No performance guarantees."
    disclaimer_font = font("regular", 13)
    disclaimer_w = draw.textlength(disclaimer, font=disclaimer_font)
    draw.text(((W - disclaimer_w) / 2, 1310), disclaimer, fill=FAINT, font=disclaimer_font)

    canvas.convert("RGB").save(OUTPUT, quality=95)
    print(OUTPUT)


if __name__ == "__main__":
    render()
