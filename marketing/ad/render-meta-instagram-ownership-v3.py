from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[2]
AD_DIR = Path(__file__).resolve().parent
BACKGROUND = AD_DIR / "tradehelp-ownership-background-v1.png"
ICON = ROOT / "build" / "icon.png"
OUTPUT = AD_DIR / "tradehelp-meta-instagram-ownership-v4-campaign-ready.png"

W, H = 1080, 1350
SURFACE = "#151B26"
SURFACE_2 = "#1C2433"
LINE = "#2A3344"
TEXT = "#E6EAF2"
DIM = "#8A94A6"
FAINT = "#5A6478"
AMBER = "#F5B642"
AMBER_SOFT = "#3A3018"
INK = "#17120A"


def font(weight: str, size: int):
    fonts = Path("C:/Windows/Fonts")
    names = {
        "black": ["seguibl.ttf", "arialbd.ttf"],
        "bold": ["seguisb.ttf", "arialbd.ttf"],
        "regular": ["segoeui.ttf", "arial.ttf"],
        "mono": ["consola.ttf", "cour.ttf"],
    }[weight]
    for name in names:
        path = fonts / name
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


def text_width(draw: ImageDraw.ImageDraw, value: str, face) -> int:
    return round(draw.textlength(value, font=face))


def draw_brand(canvas: Image.Image, draw: ImageDraw.ImageDraw):
    icon = Image.open(ICON).convert("RGBA").resize((60, 60), Image.Resampling.LANCZOS)
    canvas.alpha_composite(icon, (58, 46))
    brand_font = font("black", 37)
    draw.text((134, 53), "Trade", fill=TEXT, font=brand_font)
    draw.text((134 + text_width(draw, "Trade", brand_font), 53), "Help", fill=AMBER, font=brand_font)

    pill_font = font("mono", 15)
    label = "desktop app"
    pill_w = text_width(draw, label, pill_font) + 32
    x = W - 58 - pill_w
    draw.rounded_rectangle((x, 58, x + pill_w, 98), radius=10, fill=(15, 19, 27, 210), outline=LINE, width=2)
    draw.text((x + 16, 68), label, fill=DIM, font=pill_font)


def draw_chip(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, label: str, primary: bool = False):
    fill = (58, 48, 24, 220) if primary else (14, 17, 23, 178)
    outline = AMBER if primary else LINE
    color = AMBER if primary else TEXT
    face = font("mono", 17)
    draw.rounded_rectangle((x, y, x + width, y + 54), radius=12, fill=fill, outline=outline, width=2)
    label_w = text_width(draw, label, face)
    draw.text((x + (width - label_w) / 2, y + 15), label, fill=color, font=face)


def wrap_lines(draw: ImageDraw.ImageDraw, value: str, face, max_width: int) -> list[str]:
    words = value.split()
    lines = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if text_width(draw, candidate, face) <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_feature(draw: ImageDraw.ImageDraw, x: int, y: int, title: str, detail: str):
    width, height = 468, 116
    draw.rounded_rectangle((x, y, x + width, y + height), radius=17, fill=(21, 27, 38, 222), outline=(42, 51, 68, 230), width=2)
    draw.rounded_rectangle((x + 18, y + 21, x + 46, y + 49), radius=8, fill=AMBER_SOFT, outline=AMBER, width=1)
    draw.line((x + 26, y + 35, x + 31, y + 41), fill=AMBER, width=3)
    draw.line((x + 31, y + 41, x + 40, y + 29), fill=AMBER, width=3)
    draw.text((x + 60, y + 19), title, fill=TEXT, font=font("bold", 20))
    detail_font = font("regular", 15)
    lines = wrap_lines(draw, detail, detail_font, width - 80)[:2]
    for index, line in enumerate(lines):
        draw.text((x + 60, y + 54 + index * 23), line, fill=DIM, font=detail_font)


def render():
    canvas = cover(Image.open(BACKGROUND), (W, H)).convert("RGBA")
    canvas = Image.alpha_composite(canvas, Image.new("RGBA", (W, H), (3, 5, 8, 38)))

    # Deepen the center so every line remains legible at phone-feed size.
    legibility = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    legibility_draw = ImageDraw.Draw(legibility)
    legibility_draw.rounded_rectangle((34, 120, W - 34, H - 90), radius=40, fill=(5, 7, 11, 58))
    legibility = legibility.filter(ImageFilter.GaussianBlur(26))
    canvas = Image.alpha_composite(canvas, legibility)
    draw = ImageDraw.Draw(canvas)

    draw_brand(canvas, draw)

    eyebrow = "A TRADING JOURNAL YOU OWN"
    draw.text((58, 146), eyebrow, fill=AMBER, font=font("mono", 18))
    draw.text((58, 188), "STOP RENTING YOUR", fill=TEXT, font=font("black", 62))
    draw.text((58, 254), "TRADING JOURNAL.", fill=TEXT, font=font("black", 62))

    draw_chip(draw, 58, 344, 300, "ONE-TIME PURCHASE", primary=True)
    draw_chip(draw, 378, 344, 250, "NO SUBSCRIPTION")
    draw_chip(draw, 648, 344, 190, "NO ACCOUNT")
    draw_chip(draw, 858, 344, 164, "LOCAL-FIRST")

    draw.line((58, 438, 1022, 438), fill=LINE, width=2)
    draw.text((58, 466), "WHAT YOU ACTUALLY OWN", fill=AMBER, font=font("mono", 16))

    draw_feature(draw, 58, 512, "Pre-trade checklist", "Write your own rules before the session starts.")
    draw_feature(draw, 554, 512, "Offline AI coach (optional)", "Can review the notes stored on your own machine.")
    draw_feature(draw, 58, 646, "Emotion tagging", "Record whether each trade felt calm, rushed or tilted.")
    draw_feature(draw, 554, 646, "Behavior patterns", "Review habits by setup, emotion and time of day.")
    draw_feature(draw, 58, 780, "Challenge rule tracking", "Keep prop-firm challenge rules organized as you go.")
    draw_feature(draw, 554, 780, "Private local data", "Your journal stays in a file on your own disk.")

    cta_y = 938
    draw.rounded_rectangle((58, cta_y, 1022, cta_y + 126), radius=22, fill=(21, 27, 38, 234), outline=AMBER, width=2)
    cta_icon = Image.open(ICON).convert("RGBA").resize((48, 48), Image.Resampling.LANCZOS)
    canvas.alpha_composite(cta_icon, (74, cta_y + 21))
    draw = ImageDraw.Draw(canvas)
    draw.text((140, cta_y + 20), "EXPLORE TRADEHELP", fill=TEXT, font=font("black", 29))
    draw.text((140, cta_y + 64), "14-day free trial · one-time purchase · no subscription.", fill=DIM, font=font("regular", 17))
    draw.text((940, cta_y + 39), "→", fill=AMBER, font=font("black", 35))

    draw.text((58, 1104), "trade-help.app", fill=AMBER, font=font("mono", 38))
    platform = "WINDOWS  ·  MACOS  ·  LINUX"
    platform_font = font("bold", 16)
    draw.text((1022 - text_width(draw, platform, platform_font), 1122), platform, fill=DIM, font=platform_font)

    draw.line((58, 1178, 1022, 1178), fill=LINE, width=2)
    disclaimer_font = font("mono", 14)
    disclaimer_lines = [
        "Journaling and self-review software. It does not connect to a broker, place trades,",
        "or give financial advice. Not a promise of any result.",
    ]
    for index, line in enumerate(disclaimer_lines):
        draw.text((58, 1216 + index * 27), line, fill=FAINT, font=disclaimer_font)

    canvas.convert("RGB").save(OUTPUT, quality=95)
    print(OUTPUT)


if __name__ == "__main__":
    render()
