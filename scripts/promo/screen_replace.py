#!/usr/bin/env python3
"""초록 화면 자리에 실제 앱 화면을 원근에 맞춰 끼운다.  python3 screen_replace.py 장면.png 앱화면.png 출력.png"""
import sys, numpy as np
from PIL import Image, ImageFilter
def coeffs(src, dst):
    A=[];B=[]
    for (x,y),(u,v) in zip(dst,src):
        A.append([x,y,1,0,0,0,-u*x,-u*y]); B.append(u)
        A.append([0,0,0,x,y,1,-v*x,-v*y]); B.append(v)
    return np.linalg.solve(np.array(A,float),np.array(B,float)).tolist()
def replace(scene, shot):
    sc=scene.convert('RGB'); a=np.asarray(sc).astype(int)
    r,g,b=a[...,0],a[...,1],a[...,2]
    m=(g>140)&(g>r+60)&(g>b+60)
    ys,xs=np.nonzero(m)
    if len(xs)<500: raise SystemExit('초록 화면을 못 찾았다')
    s=xs+ys; d=xs-ys
    tl=(xs[s.argmin()],ys[s.argmin()]); br=(xs[s.argmax()],ys[s.argmax()])
    tr=(xs[d.argmax()],ys[d.argmax()]); bl=(xs[d.argmin()],ys[d.argmin()])
    W,H=sc.size; sh=shot.convert('RGB').copy(); sw,shh=sh.size
    # 최신 아이폰 느낌 — 화면 위 가운데 다이내믹 아일랜드(원근 변환 전에 그려서 기울기를 따라가게)
    from PIL import ImageDraw
    iw,ih=int(sw*.31),int(sw*.093); ix,iy=(sw-iw)//2,int(sw*.033)
    ImageDraw.Draw(sh).rounded_rectangle([ix,iy,ix+iw,iy+ih],radius=ih//2,fill=(0,0,0))
    warped=sh.transform((W,H),Image.PERSPECTIVE,coeffs([(0,0),(sw,0),(sw,shh),(0,shh)],[tl,tr,br,bl]),Image.BICUBIC)
    mask=Image.fromarray((m*255).astype('uint8')).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))
    out=sc.copy(); out.paste(warped,(0,0),mask)
    return out,(tl,tr,br,bl)
if __name__=='__main__':
    o,q=replace(Image.open(sys.argv[1]),Image.open(sys.argv[2])); o.save(sys.argv[3]); print(q)
