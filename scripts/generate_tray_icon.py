"""Rebuild the Windows tray icon from RyanCAD's geometric logo (requires Pillow)."""

from pathlib import Path

from PIL import Image, ImageDraw


size = 256
image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((6, 6, 250, 250), radius=55, fill="#16232c", outline="#39554f", width=5)
outer = [(128, 29), (218, 80), (218, 180), (128, 229), (38, 180), (38, 80), (128, 29)]
draw.line(outer, fill="#a3dfd0", width=12, joint="curve")
draw.line([(39, 80), (128, 130), (217, 80)], fill="#7bb5a7", width=10, joint="curve")
draw.line([(128, 130), (128, 225)], fill="#7bb5a7", width=10)
draw.polygon([(84, 101), (128, 77), (172, 101), (128, 125)], fill="#a3dfd0")
draw.polygon([(137, 152), (183, 127), (183, 161), (137, 186)], fill="#83c5b5")

target = Path(__file__).resolve().parents[1] / "src" / "ryancad" / "assets" / "tray.ico"
target.parent.mkdir(parents=True, exist_ok=True)
image.save(target, format="ICO", sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (256, 256)])
print(f"Wrote {target}")
