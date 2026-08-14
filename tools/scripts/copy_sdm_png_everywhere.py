from PIL import Image
import os, shutil

src_png = r"E:\skill\projects\smartdm\sdm.png"
img = Image.open(src_png).convert("RGBA")

# 1. Desktop & UI Resources
resources_dirs = [
    r"E:\skill\projects\smartdm\apps\desktop\src\main\resources",
    r"E:\skill\projects\smartdm\modules\desktop-ui\src\main\resources"
]

for rdir in resources_dirs:
    os.makedirs(rdir, exist_ok=True)
    shutil.copy2(src_png, os.path.join(rdir, "sdm.png"))
    shutil.copy2(src_png, os.path.join(rdir, "logo.png"))
    print(f"Copied sdm.png & logo.png to {rdir}")

# 2. Browser Extensions (Chrome & Firefox)
ext_dirs = [
    r"E:\skill\projects\smartdm\extensions\chrome\icons",
    r"E:\skill\projects\smartdm\extensions\firefox\icons"
]

icon_sizes = {
    "icon16.png": (16, 16),
    "icon48.png": (48, 48),
    "icon128.png": (128, 128)
}

for edir in ext_dirs:
    os.makedirs(edir, exist_ok=True)
    for fname, size in icon_sizes.items():
        resized = img.resize(size, Image.LANCZOS)
        out_path = os.path.join(edir, fname)
        resized.save(out_path)
        print(f"Generated {fname} ({size[0]}x{size[1]}) in {edir}")

print("Successfully replaced all logos with sdm.png everywhere!")
