// 갈라 쇼츠 엔딩(브랜드 아웃트로) 프레임 렌더(26.10.15) — make-promo.mjs 와 같은 방식, 60fps·변형(A~D).
// node scripts/promo/make-outro.mjs A [--stills 1,4,7]
// (원래: 이비터짐 scripts/make-promo.mjs 를 옮겨 씀): scripts/promo/promo.html 을 헤드리스 크롬(CDP)으로 열어
//   renderAt(t) 로 시간을 직접 넣고 한 장씩 캡처 → ffmpeg 로 무손실에 가까운 중간본(영상만) 인코딩.
//   녹화식이 아니라 프레임 단위라 프레임 드랍이 없다. 소리 섞기·최종 인코딩은 scripts/make-promo-audio.py.
//   node scripts/make-promo.mjs 16x9            → art/promo/build/video-16x9.mp4
//   node scripts/make-promo.mjs 9x16 --stills 1,8.5,18   → art/promo/build/still-9x16-<t>.jpg (확인용)
//   크롬은 하나만 띄우고, 끝나거나 끊겨도 반드시 닫는다(프로세스 그룹째).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VAR = process.argv[2] || 'A'; const AR = '9x16';
const si = process.argv.indexOf('--stills');
const STILLS = si > 0 ? process.argv[si + 1].split(',').map(Number) : null;
// --ranges 9.5-12.8,18-19.7 : 그 구간 프레임만 다시 그려 기존 video-<ar>.mp4 에 끼워 넣는다(부분 수정용)
const ri = process.argv.indexOf('--ranges');
const RANGES = ri > 0 ? process.argv[ri + 1].split(',').map((r) => r.split('-').map(Number)) : null;
const FPS = 60;
const OUT = path.join(ROOT, 'scripts/promo/build');
fs.mkdirSync(OUT, { recursive: true });
const [W, H] = AR === '9x16' ? [1080, 1920] : [1920, 1080];

const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'galla-outro-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--hide-scrollbars', '--mute-audio', '--no-first-run',
  '--allow-file-access-from-files', '--force-color-profile=srgb', '--disable-gpu-vsync', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
let ff = null;
const kill = () => {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} try { chrome.kill('SIGKILL'); } catch {}
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
};
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { kill(); try { ff?.kill('SIGKILL'); } catch {} process.exit(130); });
process.on('exit', kill);

try {
  const wsUrl = await new Promise((ok, no) => { let buf = ''; chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/ws:\/\/\S+/); if (m) ok(m[0]); }); setTimeout(() => no(new Error('크롬이 안 떴어요')), 20000); });
  const ws = new WebSocket(wsUrl);
  await new Promise((ok) => ws.addEventListener('open', ok, { once: true }));
  let seq = 0; const waits = new Map(); const errs = [];
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waits.has(m.id)) { const [ok, no] = waits.get(m.id); waits.delete(m.id); m.error ? no(new Error(m.error.message)) : ok(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(m.params.entry.text + ' ' + (m.params.entry.url || '')); });
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const id = ++seq; waits.set(id, [ok, no]); ws.send(JSON.stringify({ id, method, params, sessionId })); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, S);
  await s('Page.enable'); await s('Runtime.enable'); await s('Log.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => { const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await s('Page.navigate', { url: 'file://' + path.join(ROOT, 'scripts/promo/outro2.html') + '?v=' + VAR + (process.env.VEO ? '&veo=1' : '') });
  for (let i = 0; i < 100 && !(await ev('typeof window.READY')).includes('object'); i++) await new Promise((r) => setTimeout(r, 100));
  await ev('READY');
  if (errs.length) throw new Error('페이지 오류: ' + errs.join(' | '));
  const timing = await ev('TIMING');
  fs.writeFileSync(path.join(OUT, `o2timing-${VAR}.json`), JSON.stringify(timing, null, 1));
  const grab = async (t, fmt = 'png') => { await ev(`Promise.resolve(renderAt(${t})).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))`);
    const { data } = await s('Page.captureScreenshot', { format: fmt, quality: fmt === 'jpeg' ? 88 : undefined, clip: { x: 0, y: 0, width: W, height: H, scale: 1 } }); return Buffer.from(data, 'base64'); };
  if (STILLS) {
    for (const t of STILLS) fs.writeFileSync(path.join(OUT, `o2still-${VAR}-${t}.jpg`), await grab(t, 'jpeg'));
    console.log('stills', STILLS.length);
  } else if (RANGES) {
    const orig = path.join(OUT, `outro2-${VAR}${process.env.VEO ? '-veo' : ''}.mp4`), parts = [];
    for (const [a, b] of RANGES) {
      const f0 = Math.floor(a * FPS), f1 = Math.ceil(b * FPS), dst = path.join(OUT, `part-${AR}-${f0}.mp4`);
      ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', dst], { stdio: ['pipe', 'inherit', 'inherit'] });
      for (let i = f0; i < f1; i++) { const buf = await grab(i / FPS); if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); }
      ff.stdin.end(); await new Promise((r) => ff.on('close', r)); parts.push([f0, f1, dst]); console.log('part', f0, f1);
    }
    // 원본 [0,f0) + 새 조각 + 원본 [f1, ...) 이어 붙이기
    const N = Math.round(timing.END * FPS); const ins = ['-i', orig]; const fc = []; const segs = []; let cur = 0;
    parts.forEach(([f0, f1, dst], k) => { ins.push('-i', dst);
      fc.push(`[0:v]trim=start_frame=${cur}:end_frame=${f0},setpts=PTS-STARTPTS[o${k}]`, `[${k + 1}:v]setpts=PTS-STARTPTS[p${k}]`); segs.push(`[o${k}]`, `[p${k}]`); cur = f1; });
    fc.push(`[0:v]trim=start_frame=${cur}:end_frame=${N},setpts=PTS-STARTPTS[oz]`); segs.push('[oz]');
    fc.push(`${segs.join('')}concat=n=${segs.length}:v=1:a=0[v]`);
    const tmp = path.join(OUT, `video-${AR}.new.mp4`);
    await new Promise((ok, no) => spawn('ffmpeg', ['-v', 'error', '-y', ...ins, '-filter_complex', fc.join(';'), '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', String(FPS), tmp], { stdio: 'inherit' }).on('close', (c) => (c ? no(new Error('splice ' + c)) : ok())));
    fs.renameSync(tmp, orig); console.log('spliced', orig);
  } else {
    const N = Math.round(timing.END * FPS);
    const dst = path.join(OUT, `outro2-${VAR}${process.env.VEO ? '-veo' : ''}.mp4`);
    ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', String(FPS), dst], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      const buf = await grab(i / FPS);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 60 === 0) console.log(`${AR} ${i}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    if (errs.length) console.log('페이지 오류(렌더 중):', errs.slice(0, 5));
    console.log('done', dst, N, 'frames');
  }
  ws.close();
} catch (e) { console.error(e); process.exitCode = 1; }
finally { kill(); }
