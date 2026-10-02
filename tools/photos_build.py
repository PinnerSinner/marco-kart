# Builds assets/user/photo_<slug>.jpg (full frame, <=800px) and face_<slug>.jpg (square 320px) from the originals.
# Coordinates are given in a reference frame (rw, rh) and converted to fractions, so any resolution of the same photo works.
from PIL import Image, ImageOps
import sys, os, glob
U='/root/.claude/uploads/1e8cee4f-1f3b-50ed-b696-7fd3e0e62a9a/'
O='assets/user/'
# (upload id, slug, ref dims, face centre, face side, optional frame crop (x0,y0,x1,y1) in ref dims)
P=[
('290a0126','keffiyeh_car',(1080,1587),(560,650,650),None),
('a938e61e','headache',(1125,2000),(660,1050,800),None),
('9330bdca','couch',(2000,1500),(1380,780,620),None),
('82fc9f81','hippie',(1504,2000),(760,350,480),(0,0,1504,1300)),
('a3668c08','snake_chair',(1500,2000),(800,870,760),None),
('b7535a3c','sugarloaf',(2000,1500),(1330,720,750),None),
('de9c22cc','yoda',(1125,2000),(270,780,520),(0,300,780,1500)),
('58a560bb','desk_point',(2000,1125),(1290,500,600),None),
('63200e2e','vatican',(2000,1125),(1230,620,620),None),
('b0867223','beach_sunset',(2000,1125),(1000,600,620),(560,0,2000,1125)),
('7ed66ffd','snorkel',(2000,1500),(490,870,900),None),
('618616d7','flag_rio',(2000,1500),(930,830,700),None),
('2995016e','desert_drive',(888,1022),(400,560,480),None),
('21545872','banana_suit',(720,960),(330,265,260),None),
('a3a7b174','squish',(1500,2000),(800,850,900),None),
('68262f9e','marina_laugh',(1500,2000),(760,800,800),None),
('b498b5ca','holi',(1500,2000),(700,950,800),None),
('334ebcff','kazakh_hat',(1500,2000),(1080,1270,700),None),
('2122ddc8','banana_run',(1500,2000),(620,1100,800),None),
('ccd40b73','stonehenge',(2000,1500),(1430,780,800),None),
# new: certificate = Marco only (centre figure), graduation = tight crop, other people blurred (see BLUR)
('02e70190','certificate',(685,745),(345,195,150),(264,128,464,500)),
('6bb8751e','graduation',(791,791),(285,330,200),(40,250,425,791)),
]
# Regions (polygons in the ref frame of the ORIGINAL) blurred out so no bystander is recognisable.
BLUR={
 'certificate':[[(262,236),(335,236),(335,300),(262,300)]],            # a head peeping behind Marco's shoulder
 'graduation':[[(100,402),(142,402),(142,446),(100,446)],[(345,380),(400,380),(400,436),(345,436)],[(300,398),(348,398),(348,432),(300,432)],  # small heads over his shoulders
               [(372,340),(530,340),(530,791),(430,791),(425,600),(372,520)],  # man in grey jacket behind
               [(0,330),(112,330),(112,791),(0,791)]],                          # man on the left
}
for uid,slug,(rw,rh),(cx,cy,side),frame in P:
    src=glob.glob(U+uid+'-image.*')[0]
    im=ImageOps.exif_transpose(Image.open(src)).convert('RGB'); W,H=im.size
    fx,fy=W/rw,H/rh
    if slug in BLUR:
        import numpy as np, cv2
        a=np.array(im); m=np.zeros(a.shape[:2],np.uint8)
        for poly in BLUR[slug]: cv2.fillPoly(m,[np.array([(int(x*fx),int(y*fy)) for x,y in poly])],255)
        k=int(max(W,H)/12)|1
        b=cv2.GaussianBlur(a,(k,k),0); m=cv2.GaussianBlur(m,(21,21),0)[...,None]/255.0
        im=Image.fromarray((a*(1-m)+b*m).astype('uint8'))
    f=im.copy()
    if frame:
        x0,y0,x1,y1=frame; f=im.crop((int(x0*fx),int(y0*fy),int(x1*fx),int(y1*fy)))
    if min(f.size)<500: f=f.resize((f.width*2,f.height*2),Image.LANCZOS)
    f.thumbnail((800,800),Image.LANCZOS); f.save(f'{O}photo_{slug}.jpg',quality=80,optimize=True,progressive=True)
    s=side*fx/2; ccx=cx*fx; ccy=cy*fy
    box=(int(max(0,ccx-s)),int(max(0,ccy-s)),int(min(W,ccx+s)),int(min(H,ccy+s)))
    face=im.crop(box); side_px=min(face.size); 
    face=face.crop((0,0,side_px,side_px)).resize((320,320),Image.LANCZOS); face.save(f'{O}face_{slug}.jpg',quality=82,optimize=True)
    print(slug,f.size,box)
# passport portrait: marco_passport.jpg is a tidy crop of the portrait only (kept in the repo, no document text); derive photo_/face_ from it
pp=Image.open(O+'marco_passport.jpg').convert('RGB'); pw,ph=pp.size; s=pw/1004
cx,cy,side=490*s,470*s,760*s
pp.crop((int(cx-side/2),int(cy-side/2),int(cx+side/2),int(cy+side/2))).resize((320,320),Image.LANCZOS).save(O+'face_passport.jpg',quality=84,optimize=True)
pp.thumbnail((800,800),Image.LANCZOS); pp.save(O+'photo_passport.jpg',quality=82,optimize=True,progressive=True)
# expressions for Marco's face plane
import shutil
shutil.copy(O+'face_headache.jpg',O+'marco_face_sad.jpg')
shutil.copy(O+'face_squish.jpg',O+'marco_face_hit.jpg')
shutil.copy(O+'face_marina_laugh.jpg',O+'marco_face_wow.jpg')
# contact sheet for a visual check
import glob
fs=sorted(glob.glob(O+'face_*.jpg')); n=len(fs); cols=5; rows=(n+cols-1)//cols
sheet=Image.new('RGB',(cols*200,rows*200),'white')
for i,fp in enumerate(fs): sheet.paste(Image.open(fp).resize((200,200)),((i%cols)*200,(i//cols)*200))
sheet.save('/tmp/claude-0/-home-claude/1e8cee4f-1f3b-50ed-b696-7fd3e0e62a9a/scratchpad/faces_sheet.png')
