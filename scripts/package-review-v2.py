from pathlib import Path
import zipfile,subprocess,json
root=Path.cwd(); out=root/'KunlunMeta-Loom-评审修正版-精简验收包.zip'
files=[]
for folder in ['src','public','scripts']:
 files.extend(p for p in (root/folder).rglob('*') if p.is_file() and 'node_modules' not in p.parts and '__pycache__' not in p.parts)
for name in ['README.md','package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html','.gitignore']:
 p=root/name
 if p.exists(): files.append(p)
files.extend(p for p in (root/'review/mechanics-v2').iterdir() if p.is_file() and p.suffix!='.webm')
info={'commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'excluded':['node_modules','caches','.git','historical evidence','raw WebM (MP4 contains same live audio/video)']}
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for p in files:z.write(p,p.relative_to(root).as_posix())
 z.write(root/'review/atelier/after-hero.png','对照/修正前.png')
 z.write(root/'review/atelier/reference.png','对照/CrommaCode原版.png')
 z.writestr('版本信息.json',json.dumps(info,ensure_ascii=False,indent=2))
 z.writestr('先读我.md','请先阅读 review/mechanics-v2/REVIEW.md。当前图像与带音轨录屏在同目录。README.md 提供启动方式。右侧为有固定杆长约束的伺服曲柄滑块；旧小齿轮假连杆已经移除。仍未完成动力学或制造校核。包内无 node_modules；执行 npm install 安装依赖。')
with zipfile.ZipFile(out) as z:
 assert z.testzip() is None
 assert not any('node_modules' in n for n in z.namelist())
 print(json.dumps({'zip':str(out),'entries':len(z.namelist()),'MB':round(out.stat().st_size/1024/1024,2)},ensure_ascii=False))
