# -*- coding: utf-8 -*-
"""Vectorize a white-on-black line drawing into SVG paths.

Used by tools/gen_olympus_art.py.

A clean line drawing binarizes perfectly - the ink is near-white and
everything else near-black - so marching squares recovers every contour
exactly. The loops are emitted as FILLED paths rather than stroked
centrelines: filling the outline of a drawn stroke reproduces that stroke
exactly, including where it tapers, with no centreline guesswork.

Every loop must end up in ONE <path> element with fill-rule="evenodd", so
that the inner loop of an enclosed gap punches a hole instead of being
filled solid. See gen_olympus_art.py.
"""
import os
import sys
import math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageFilter, ImageOps
from lib_contours import marching_squares, rdp, chaikin, area

def crop_ink(im, pad=0.03):
    g=im.convert('L'); w,h=g.size; px=g.load()
    xs=[];ys=[]
    for y in range(0,h,2):
        for x in range(0,w,2):
            if px[x,y]>110: xs.append(x); ys.append(y)
    if not xs: return im
    x0,x1=min(xs),max(xs); y0,y1=min(ys),max(ys)
    dx=(x1-x0)*pad; dy=(y1-y0)*pad
    return im.crop((max(0,int(x0-dx)),max(0,int(y0-dy)),
                    min(w,int(x1+dx)),min(h,int(y1+dy))))

def fit_811(im, headroom=1.0):
    """Letterbox the ink box onto an 8:11 canvas without distorting it."""
    w,h=im.size
    tw,th=8,11
    if w/h > tw/th: nw,nh=w,int(w*th/tw)
    else:           nh,nw=h,int(h*tw/th)
    nh=int(nh*headroom)
    canvas=Image.new('L',(nw,nh),0)
    canvas.paste(im.convert('L'),((nw-w)//2,(nh-h)//2))
    return canvas

def trace(path, work=300, thr=110, eps=0.7, smooth=2, min_area=6):
    im=Image.open(path).convert('L')
    im=crop_ink(im)
    im=fit_811(im)
    W0,H0=320,440
    im=im.resize((work,int(work*11/8)),Image.LANCZOS)
    im=im.filter(ImageFilter.GaussianBlur(0.5))
    w,h=im.size; px=im.load()
    sx,sy=W0/w,H0/h
    m=[[1 if px[x,y]>=thr else 0 for x in range(w)] for y in range(h)]

    # marching_squares returns a loop for every ink/paper boundary, including
    # the inner boundary of an enclosed gap (a robe fold, the disc of a
    # shield). Those loops must be punched OUT, not filled: with fill-rule
    # evenodd, emitting both the outer and inner loops does exactly that.
    # The bug this fixes: Zeus's robe, Ares' sword and Hercules' beard came
    # out as solid slabs of colour.
    ds=[]
    for lp in marching_squares(m,w,h):
        if area(lp)<min_area: continue
        s=rdp(lp,eps)
        if len(s)<4: continue
        s=chaikin(s,smooth)
        pts=[(round(x*sx),round(y*sy)) for x,y in s]
        out=[pts[0]]
        for q in pts[1:]:
            if q!=out[-1]: out.append(q)
        if len(out)<4: continue
        d='M%d %d'%out[0]+''.join('L%d %d'%q for q in out[1:])+'Z'
        ds.append(d)
    return ds
