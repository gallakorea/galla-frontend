import numpy as np, scipy.signal as sg, scipy.io.wavfile as wf, sys
SR=48000; DUR=3.7; N=int(SR*DUR); rng=np.random.default_rng(7)
t=np.arange(N)/SR
L=np.zeros(N); R=np.zeros(N)
def add(sig,start,pan=0.0,gain=1.0):
    i=int(start*SR); n=min(len(sig),N-i)
    gl=np.cos((pan+1)*np.pi/4); gr=np.sin((pan+1)*np.pi/4)
    L[i:i+n]+=sig[:n]*gain*gl*1.414; R[i:i+n]+=sig[:n]*gain*gr*1.414
def env(n,a,d):  # attack sec, exp decay tau
    x=np.arange(n)/SR; e=np.exp(-x/d); k=int(a*SR)
    if k>0: e[:k]*=np.linspace(0,1,k)**0.7
    return e
def tone(f,dur,harm=(1,.5,.3,.15),detune=0.0):
    n=int(dur*SR); x=np.arange(n)/SR; s=np.zeros(n)
    for h,a in enumerate(harm,1): s+=a*np.sin(2*np.pi*f*h*(1+detune)*x)
    return s
def lp(x,fc,order=2): b,a=sg.butter(order,fc/(SR/2),'low'); return sg.lfilter(b,a,x)
def hp(x,fc,order=2): b,a=sg.butter(order,fc/(SR/2),'high'); return sg.lfilter(b,a,x)

# 1) 빨아들임 riser 0.10~0.62 : 상승 필터 노이즈 + 상승 사인, 끝에 뚝
rs,re=0.10,0.62; n=int((re-rs)*SR); x=np.arange(n)/SR; p=x/(re-rs)
noise=rng.standard_normal(n)
# 시간가변 밴드패스 근사: 블록별 필터
out=np.zeros(n); blk=480; zi=None
for i in range(0,n,blk):
    fc=300+ (6000-300)*p[i]**2
    b,a=sg.butter(2,[fc*0.7/(SR/2),min(fc*1.3,23000)/(SR/2)],'band')
    if zi is None: zi=np.zeros(max(len(a),len(b))-1)
    out[i:i+blk],zi=sg.lfilter(b,a,noise[i:i+blk],zi=zi)
glide=np.sin(2*np.pi*np.cumsum(220*2**(3*p))/SR)*0.25
riser=(out*0.6+glide)*(p**2.2)
add(riser,rs,0,0.35)

def hit(t0,f,pan,gain,warm):
    # 서브 킥(피치 드롭)
    n=int(1.6*SR); x=np.arange(n)/SR
    fsub=f/2*(1+1.8*np.exp(-x/0.035))
    sub=np.sin(2*np.pi*np.cumsum(fsub)/SR)*env(n,0.002,0.45)
    # 몸통 음(피아노/브라스 같은 배음, 따뜻할수록 배음 많게)
    body=tone(f,1.6,(1,.55,.35,.22,.12) if warm else (1,.35,.15,.06))
    body+=0.5*tone(f,1.6,(1,.3,.1),detune=0.004)
    body=np.tanh(1.6*body)*env(n,0.004,0.55 if warm else 0.40)
    body=lp(body,2600 if warm else 1500)
    # 충격 트랜지언트(노이즈 버스트)
    tr=hp(rng.standard_normal(n),900)*env(n,0.0008,0.018)
    s=sub*1.0+body*0.55+tr*0.35
    add(s,t0,pan,gain)

D2=73.42; A2=110.0
hit(0.62,D2,-0.45,0.95,False)   # 두(갈) — 차가운 파랑, 왼쪽
hit(1.30,A2,+0.45,1.10,True)    # 둥(라) — 뜨거운 빨강, 오른쪽, 5도 위
add(np.sin(2*np.pi*np.cumsum(np.full(int(1.8*SR),36.7)*(1+1.2*np.exp(-np.arange(int(1.8*SR))/SR/0.04)))/SR)*env(int(1.8*SR),0.002,0.6),1.30,0,0.6)  # D1 서브 받침

# 3) 블룸: 두 진영이 하나로 — D장조 add9 브라스 패드, 필터 열림
bs=1.30; bd=2.35; n=int(bd*SR); x=np.arange(n)/SR
chord=[146.83,220.0,293.66,369.99,440.0,659.25]   # D3 A3 D4 F#4 A4 E5
padL=np.zeros(n); padR=np.zeros(n)
for i,f in enumerate(chord):
    for dt,side in ((-0.006,0),(0.006,1)):
        ph=2*np.pi*f*(1+dt)*x + rng.uniform(0,6.28)
        saw=sg.sawtooth(ph)*0.6+np.sin(ph)*0.4
        (padL if side==0 else padR)[:]+=saw/len(chord)
ae=np.minimum(1,x/0.06)*np.exp(-x/1.1)
def sweep(sig):
    out=np.zeros(n); blk=480
    zi=None
    for i in range(0,n,blk):
        fc=350+ (5200-350)*(1-np.exp(-x[i]/0.28))*np.exp(-x[i]/2.2)
        b,a=sg.butter(2,min(fc,20000)/(SR/2),'low')
        if zi is None: zi=sg.lfilter_zi(b,a)*0
        out[i:i+blk],zi=sg.lfilter(b,a,sig[i:i+blk],zi=zi)
    return out
padL=sweep(padL)*ae; padR=sweep(padR)*ae
i0=int(bs*SR); m=min(n,N-i0); L[i0:i0+m]+=padL[:m]*0.55; R[i0:i0+m]+=padR[:m]*0.55

# 4) 반짝임: 성운 속 별 팡팡 — D 펜타토닉 고음 핑
pent=[1174.66,1479.98,1760.0,1975.53,2349.32,2959.96,3520.0]
times=[1.42,1.52,1.60,1.71,1.80,1.93,2.05,2.22,2.40]
for k,tt in enumerate(times):
    f=pent[(k*3)%len(pent)]; n2=int(0.9*SR)
    s=(np.sin(2*np.pi*f*np.arange(n2)/SR)+0.3*np.sin(2*np.pi*f*2*np.arange(n2)/SR))*env(n2,0.002,0.16)*np.linspace(1,0,n2)**0.5
    add(s,tt,rng.uniform(-0.8,0.8),0.10*(1-k/14))

# 5) 리버브: 합성 IR(2.4s) 좌우 비상관
irn=int(2.4*SR); xi=np.arange(irn)/SR
def ir(): r=rng.standard_normal(irn)*np.exp(-xi/0.55); r=lp(r,7000); r[:int(0.012*SR)]=0; return r/np.sqrt(np.sum(r**2))
wetL=sg.fftconvolve(L,ir())[:N]; wetR=sg.fftconvolve(R,ir())[:N]
L2=L+wetL*0.45; R2=R+wetR*0.45
# 마스터: 저역 정리, 소프트 클립, 노멀라이즈, 끝 페이드
L2=hp(L2,28); R2=hp(R2,28)
mx=max(np.abs(L2).max(),np.abs(R2).max()); L2/=mx; R2/=mx
L2=np.tanh(1.3*L2)/np.tanh(1.3); R2=np.tanh(1.3*R2)/np.tanh(1.3)
fade=int(0.5*SR); f_=np.linspace(1,0,fade)**2; L2[-fade:]*=f_; R2[-fade:]*=f_
pk=10**(-1/20); g=pk/max(np.abs(L2).max(),np.abs(R2).max())
st=np.stack([L2*g,R2*g],1)
wf.write(sys.argv[1],SR,(st*32767).astype(np.int16)); print('ok',st.shape)
