from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'review'/'atelier'
w,h=1104,756
font=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',22)
small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',14)
canvas=Image.new('RGB',(w*3+64, h+110),'#FBF9F6')
d=ImageDraw.Draw(canvas)
for i,(f,title,subtitle) in enumerate([
 ('reference.png','01 / ORIGINAL REFERENCE','CrommaCode — supplied canvas evidence'),
 ('before.png','02 / BEFORE','KunlunMeta — baseline 00aeb56'),
 ('after-idle.png','03 / AFTER','KunlunMeta — Mechanical Arts / Series 01')]):
 x=16+i*(w+16)
 d.text((x,14),title,font=font,fill='#171C60')
 d.text((x,45),subtitle,font=small,fill='#78878A')
 im=Image.open(p/f).convert('RGB').resize((w,h),Image.Resampling.LANCZOS)
 canvas.paste(im,(x,82))
canvas.save(p/'comparison.png')
print(p/'comparison.png')
