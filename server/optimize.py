# 旧图片迁移后压缩为WebP，保留透明背景。
import sys
from PIL import Image, ImageOps
with Image.open(sys.argv[1]) as source:
    img = ImageOps.exif_transpose(source).convert('RGBA')
    img.thumbnail((int(sys.argv[3]), int(sys.argv[3])))
    img.save(sys.argv[2], 'WEBP', quality=82, method=4)
