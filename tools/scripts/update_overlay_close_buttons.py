import os, shutil

chrome_dir = r"E:\skill\projects\smartdm\extensions\chrome"
firefox_dir = r"E:\skill\projects\smartdm\extensions\firefox"

# Copy updated Chrome extension files to Firefox extension
for fname in ["universal_overlay.js", "youtube_overlay.js", "tiktok_overlay.js", "ytmusic_overlay.js"]:
    cpath = os.path.join(chrome_dir, fname)
    fpath = os.path.join(firefox_dir, fname)
    if os.path.exists(cpath):
        shutil.copy2(cpath, fpath)
        print(f"Synced {fname} to Firefox extension!")

print("All overlay files updated and synced across Chrome and Firefox!")
