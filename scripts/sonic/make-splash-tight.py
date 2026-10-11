# 채택본(26.10.11): A 를 '더 짧고 단단하게'(사장님) — make-splash-sound.py 의 함수들을 쓴다. 결과 A-tight.wav → aac 128k → assets/sound/splash-galla.m4a
exec(open(__file__.replace('make-splash-tight.py','make-splash-sound.py')).read().split("T1,T2=0.62,1.30")[0])
T1,T2=0.62,1.30
D2,A2,D3,A1=73.42,110.0,146.83,55.0
def click(n,amt=0.5):
    # 단단한 어택: 아주 짧은 저역 펀치(30ms) — 폰 스피커에서도 '탁' 하고 맺힌다
    x=np.arange(n)/SR; return lp(rng.standard_normal(n),1200)*np.exp(-x/0.008)*amt + np.sin(2*np.pi*180*x)*np.exp(-x/0.02)*amt*0.8
m=Mix(2.4)
m.add(sub(D2,0.9,1.8,0.22),T1,-0.15,0.95); m.add(lp(timpani(D2,0.9,0.28),1000),T1,-0.2,0.5); m.add(click(int(0.2*SR),0.45),T1,-0.15,1)
m.add(sub(D2,1.0,2.0,0.32),T2,0.15,1.05); m.add(lp(timpani(A2,1.0,0.32),1300),T2,0.2,0.55); m.add(click(int(0.2*SR),0.55),T2,0.15,1)
l,r=pad([D2,A2,D3,185.0,220.0],1.05,0.04,0.38,1000); m.addst(l,r,T2,0.5)
master(m,0.16,1.3,0.32,2500,'A-tight.wav')
print('ok')
