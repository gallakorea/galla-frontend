# 갈라 스플래시 소리 로고 생성기(26.10.11). 시안 A(미니멀)가 채택 — 결과 A.wav 를 aac 128k 로 assets/sound/splash-galla.m4a 에. B·C 는 반려 시안.
import numpy as np, scipy.signal as sg, scipy.io.wavfile as wf, sys
SR=48000; rng=np.random.default_rng(11)
def lp(x,fc,o=2): b,a=sg.butter(o,fc/(SR/2),'low'); return sg.lfilter(b,a,x)
def hp(x,fc,o=2): b,a=sg.butter(o,fc/(SR/2),'high'); return sg.lfilter(b,a,x)
def ar(n,a,tau):
    x=np.arange(n)/SR; e=np.exp(-x/tau); k=max(1,int(a*SR)); e[:k]*=np.sin(np.linspace(0,np.pi/2,k)); return e
class Mix:
    def __init__(s,dur): s.N=int(dur*SR); s.L=np.zeros(s.N); s.R=np.zeros(s.N)
    @staticmethod
    def tail(x):
        x=np.array(x,dtype=float); k=min(len(x)//3,int(0.4*SR)); x[-k:]*=np.cos(np.linspace(0,np.pi/2,k))**2; return x
    def add(s,sig,t0,pan=0,g=1):
        sig=s.tail(sig); i=int(t0*SR); n=min(len(sig),s.N-i); gl=np.cos((pan+1)*np.pi/4)*1.414; gr=np.sin((pan+1)*np.pi/4)*1.414
        s.L[i:i+n]+=sig[:n]*g*gl; s.R[i:i+n]+=sig[:n]*g*gr
    def addst(s,l,r,t0,g=1):
        l=s.tail(l); r=s.tail(r); i=int(t0*SR); n=min(len(l),s.N-i); s.L[i:i+n]+=l[:n]*g; s.R[i:i+n]+=r[:n]*g
def sub(f,dur,drop=1.6,tau=0.5):
    n=int(dur*SR); x=np.arange(n)/SR; fr=f*(1+drop*np.exp(-x/0.03))
    return np.sin(2*np.pi*np.cumsum(fr)/SR)*ar(n,0.002,tau)
def timpani(f,dur,tau=0.9):
    n=int(dur*SR); x=np.arange(n)/SR; s=np.zeros(n)
    for r,a,d in ((1,1,1),(1.504,.5,.7),(1.742,.3,.5),(2.0,.25,.45),(2.245,.15,.35),(2.494,.1,.3)):
        s+=a*np.sin(2*np.pi*f*r*x+rng.uniform(0,6))*np.exp(-x/(tau*d))
    hit=lp(rng.standard_normal(n),1800)*np.exp(-x/0.012)*0.6
    k=int(0.003*SR); s[:k]*=np.linspace(0,1,k)
    return s+hit
def piano(f,dur,tau=1.6,bright=1.0):
    n=int(dur*SR); x=np.arange(n)/SR; s=np.zeros(n); B=0.0004
    for h in range(1,14):
        fh=f*h*np.sqrt(1+B*h*h)
        if fh>9000: break
        a=(1/h**1.1)*(bright if h>3 else 1)
        s+=a*np.sin(2*np.pi*fh*x+rng.uniform(0,6))*np.exp(-x/(tau/(1+0.35*h)))
    ham=lp(rng.standard_normal(n),2500)*np.exp(-x/0.006)*0.25
    k=int(0.004*SR); s[:k]*=np.linspace(0,1,k)
    return np.tanh(1.2*(s+ham))
def pad(freqs,dur,att,tau,cut,det=0.004):
    n=int(dur*SR); x=np.arange(n)/SR; L=np.zeros(n); R=np.zeros(n)
    for f in freqs:
        for d,side in ((-det,0),(det,1),(0,2)):
            ph=2*np.pi*f*(1+d)*x+rng.uniform(0,6)
            v=sg.sawtooth(ph)*0.5+np.sin(ph)*0.5
            if side==0: L+=v
            elif side==1: R+=v
            else: L+=v*0.5; R+=v*0.5
    e=(1-np.exp(-x/att))*np.exp(-x/tau)
    L=lp(L,cut,4)*e/len(freqs); R=lp(R,cut,4)*e/len(freqs)
    return np.tanh(1.5*L), np.tanh(1.5*R)
def master(m,wet=0.35,irdur=3.0,irtau=0.8,irlp=3500,out='o.wav'):
    irn=int(irdur*SR); xi=np.arange(irn)/SR
    def ir():
        r=rng.standard_normal(irn)*np.exp(-xi/irtau); r=lp(r,irlp); r[:int(0.02*SR)]=0; return r/np.sqrt(np.sum(r**2))
    L=m.L+sg.fftconvolve(m.L,ir())[:m.N]*wet; R=m.R+sg.fftconvolve(m.R,ir())[:m.N]*wet
    L=hp(L,30); R=hp(R,30)
    mx=max(abs(L).max(),abs(R).max()); L/=mx; R/=mx
    L=np.tanh(1.4*L)/np.tanh(1.4); R=np.tanh(1.4*R)/np.tanh(1.4)
    fd=int(0.6*SR); f=np.linspace(1,0,fd)**2; L[-fd:]*=f; R[-fd:]*=f
    g=10**(-1/20)/max(abs(L).max(),abs(R).max())
    wf.write(out,SR,(np.stack([L*g,R*g],1)*32767).astype(np.int16))
T1,T2=0.62,1.30
D1,A1,D2,A2,D3=36.71,55.0,73.42,110.0,146.83
# A: 미니멀 — 깊은 타격 두 번 + 따뜻한 저음 스웰
m=Mix(3.6)
m.add(sub(D2,1.5,1.4,0.35),T1,-0.15,0.9); m.add(lp(timpani(D2,1.5,0.5),900),T1,-0.2,0.45)
m.add(sub(A1*2/1,1.8,1.4,0.5)*0.0+sub(D2,1.8,1.6,0.6),T2,0.15,1.0); m.add(lp(timpani(A2,1.8,0.6),1100),T2,0.2,0.5)
l,r=pad([D2,A2,D3,185.0,220.0],2.3,0.18,1.0,900); m.addst(l,r,T2,0.55)
master(m,0.32,3.0,0.75,3000,'A.wav')
# B: 시네마틱 — 타악 + 브라스풍 화음 오픈
m=Mix(3.8)
m.add(sub(D2,1.5,2.0,0.4),T1,-0.2,0.85); m.add(timpani(D2*2,1.5,0.6),T1,-0.25,0.5)
m.add(sub(D2,2.0,2.0,0.7),T2,0.0,1.0); m.add(timpani(A2,2.0,0.7),T2,0.25,0.55)
l,r=pad([D2,A2,D3,185.0,220.0,293.66],2.5,0.08,1.2,1600,0.006); m.addst(l,r,T2,0.7)
l,r=pad([D1,A1],2.5,0.05,1.0,300); m.addst(l,r,T2,0.5)
master(m,0.4,3.4,0.95,2800,'B.wav')
# C: 피아노 — 저음 피아노 두 음 + 서브 + 공간
m=Mix(3.8)
p1=piano(D2,2.0,1.4,0.8)+0.6*piano(D3,2.0,1.2,0.6); m.add(p1,T1,-0.2,0.6); m.add(sub(D2,1.2,1.0,0.3),T1,0,0.55)
p2=piano(A2,2.6,1.8,0.9)+0.55*piano(D3,2.6,1.6,0.7)+0.45*piano(185.0,2.6,1.5,0.7)+0.35*piano(D2,2.6,1.8,0.7)
m.add(p2,T2,0.2,0.65); m.add(sub(D2,1.6,1.2,0.45),T2,0,0.7)
master(m,0.42,3.4,0.9,4000,'C.wav')
print('ok')
