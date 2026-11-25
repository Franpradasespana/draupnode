# Rehace docs/img/draupnode.gif (el del README) con las capturas de la ayuda,
# y docs/img/draupnode.en.gif (el de README.en.md) con las de inglés.
# Uso: make gif   (después de «make capturas» y «make capturas-en»). Necesita Pillow (python3-pil).
import os
import sys
from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
EN = len(sys.argv) > 1 and sys.argv[1] == "en"
SRC = os.path.join(AQUI, "..", "frontend", "src", "assets", "ayuda", *(["en"] if EN else []))
OUT = os.path.join(AQUI, "..", "docs", "img", "draupnode.en.gif" if EN else "draupnode.gif")
PANTALLAS = ["panel", "servidor", "servidor-historial", "servidor-apps", "despliegue", "catalogo", "docker-vista", "terminal"]

imgs = [Image.open(os.path.join(SRC, f + ".webp")).convert("RGB").resize((960, 600), Image.LANCZOS) for f in PANTALLAS]
# Una sola paleta para todas: así no parpadean los colores al pasar de una a otra.
pal = imgs[1].quantize(colors=255, method=Image.Quantize.MEDIANCUT)
frames = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in imgs]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
frames[0].save(OUT, save_all=True, append_images=frames[1:], duration=2600, loop=0, optimize=True)
print(f"{os.path.relpath(OUT)}: {len(frames)} pantallas, {os.path.getsize(OUT) // 1024} KB")
