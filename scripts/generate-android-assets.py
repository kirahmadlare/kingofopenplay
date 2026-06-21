from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "android" / "app" / "src" / "main" / "res"
LOGO = Image.open(ROOT / "openplay-ph-logo.png").convert("RGBA")

NAVY = (34, 58, 102, 255)
CREAM = (245, 248, 252, 255)


def contain(image: Image.Image, size: tuple[int, int], scale: float) -> Image.Image:
    target = (max(1, int(size[0] * scale)), max(1, int(size[1] * scale)))
    copy = image.copy()
    copy.thumbnail(target, Image.Resampling.LANCZOS)
    return copy


def centered(canvas: Image.Image, image: Image.Image) -> None:
    x = (canvas.width - image.width) // 2
    y = (canvas.height - image.height) // 2
    canvas.alpha_composite(image, (x, y))


def launcher(path: Path, round_icon: bool = False) -> None:
    existing = Image.open(path)
    size = existing.size
    canvas = Image.new("RGBA", size, (0, 0, 0, 0) if round_icon else NAVY)
    if round_icon:
        draw = ImageDraw.Draw(canvas)
        draw.ellipse((0, 0, size[0] - 1, size[1] - 1), fill=NAVY)
    centered(canvas, contain(LOGO, size, 0.78))
    canvas.convert("RGBA").save(path)


def foreground(path: Path) -> None:
    existing = Image.open(path)
    canvas = Image.new("RGBA", existing.size, (0, 0, 0, 0))
    centered(canvas, contain(LOGO, existing.size, 0.62))
    canvas.save(path)


def splash(path: Path) -> None:
    existing = Image.open(path)
    canvas = Image.new("RGBA", existing.size, CREAM)
    centered(canvas, contain(LOGO, existing.size, 0.34))
    canvas.convert("RGB").save(path)


for icon_path in RES.glob("mipmap-*/ic_launcher.png"):
    launcher(icon_path)

for icon_path in RES.glob("mipmap-*/ic_launcher_round.png"):
    launcher(icon_path, round_icon=True)

for icon_path in RES.glob("mipmap-*/ic_launcher_foreground.png"):
    foreground(icon_path)

for splash_path in RES.glob("drawable*/splash.png"):
    splash(splash_path)

print("Android launcher and splash assets generated.")
