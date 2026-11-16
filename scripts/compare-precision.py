from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
p=Path(__file__).resolve().parent.parent/'review/precision-flat'
ref=p/'reference.png'
if not ref.exists():
 Image.open(p.parents[2]/'analysis/r2-canvas-package/stills/Loom_canvas_1472x1008.png').save(ref)
try:
 font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',22)
except OSError:
 font=ImageFont.load_default(size=22)
for name,items,w in [
 ('comparison-three.png',[('reference.png','CROMMACODE / SUPPLIED REFERENCE'),('before-0s.png','DSH / c6d93db / IDLE'),('after-0s.png','KUNLUNMETA / PRECISION FLAT / IDLE')],1104),
 ('comparison-before-after.png',[('before-0s.png','BEFORE / DSH'),('after-0s.png','AFTER / PRECISION FLAT MECHANICAL')],1472)]:
 h=round(w*1008/1472);im=Image.new('RGB',(len(items)*w,h+68),'#FBF9F6');d=ImageDraw.Draw(im)
 for i,(file,label) in enumerate(items):
  d.text((i*w+20,20),label,fill='#171C60',font=font)
  im.paste(Image.open(p/file).convert('RGB').resize((w,h),Image.Resampling.LANCZOS),(i*w,68))
 im.save(p/name)
