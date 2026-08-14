from PIL import Image
import os

png_path = r"E:\skill\projects\smartdm\sdm.png"
img = Image.open(png_path)

if img.mode != 'RGBA':
    img = img.convert('RGBA')

sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]

app_ico = r"E:\skill\projects\smartdm\tools\scripts\app.ico"
setup_ico = r"E:\skill\projects\smartdm\tools\scripts\setup.ico"

img.save(app_ico, format='ICO', sizes=sizes)
img.save(setup_ico, format='ICO', sizes=sizes)

print("Saved app.ico and setup.ico from sdm.png successfully!")
