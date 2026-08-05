// js/login.js
// 이중 모드(2026-07-27):
//  - MPA(단독 문서, body data-page≠'spa') → bootMPA()가 기존 동작 그대로 즉시 실행.
//  - SPA(app.html) → 어댑터(js/spa/views/login.js)가 GALLA_PAGE_LOGIN.mount(root, params)를
//    부를 때까지 대기. 히스토리 트랩·스와이프 홈·pop-out 등 '문서 소유' 로직은 MPA 전용.

(function () {
    console.log("[login.js] 로드됨");

    const IS_SPA = !!(document.body && document.body.dataset.page === "spa");

    function waitForClient() {
        return new Promise(resolve => {
            const timer = setInterval(() => {
                if (window.supabaseClient) {
                    console.log("[login.js] supabaseClient 준비됨");
                    clearInterval(timer);
                    resolve();
                }
            }, 20);
        });
    }

    /* ====================================================================
       공용: 로그인 폼 초기화 (MPA·SPA 공용)
       scope — 요소 탐색 루트(MPA: document, SPA: 스택 뷰 root)
       done  — 성공/기세션 시 이동(MPA: goHome, SPA: 스택 pop + next 라우트)
    ==================================================================== */
    async function initLoginForm(scope, done) {
        await waitForClient();

        const supabase = window.supabaseClient;

        const email = scope.querySelector("#email");
        const pw = scope.querySelector("#password");
        const loginBtn = scope.querySelector("#loginBtn");

        if (!loginBtn) {
            console.error("[login.js] loginBtn 찾을 수 없음");
            return;
        }

        /* ----------------------------------------------------
           🔥 자동 로그인 — 이미 세션이 있으면 로그인 화면 건너뛰고 홈으로
        ---------------------------------------------------- */
        try {
            const { data: sess } = await supabase.auth.getSession();
            if (sess?.session?.user) { done(); return; }
        } catch (e) {}

        /* 이메일 기억 — 지난 로그인 이메일 자동 채움 */
        try {
            const last = localStorage.getItem("galla_last_email");
            if (last && email && !email.value) email.value = last;
        } catch (e) {}

        /* ----------------------------------------------------
           🔥 Enter 키로도 로그인 실행
        ---------------------------------------------------- */
        function handleEnter(event) {
            if (event.key === "Enter") {
                event.preventDefault();     // 폼 자동 제출 방지
                loginBtn.click();           // 버튼 클릭 실행
            }
        }

        email.addEventListener("keypress", handleEnter);
        pw.addEventListener("keypress", handleEnter);


        /* ----------------------------------------------------
           🔥 로그인 이벤트
        ---------------------------------------------------- */
        loginBtn.addEventListener("click", async () => {
            console.log("[login.js] 로그인 버튼 클릭됨");

            const emailVal = email.value.trim();
            const pwVal = pw.value.trim();

            if (!emailVal || !pwVal) {
                alert("이메일과 비밀번호를 입력해주세요.");
                return;
            }

            // Cloudflare Turnstile 캡차 토큰(있으면 첨부; Supabase 캡차 비활성 시 무시됨)
            const captchaToken = (window.turnstile && window.turnstile.getResponse()) || undefined;

            const { data: loginData, error } = await supabase.auth.signInWithPassword({
                email: emailVal,
                password: pwVal,
                options: captchaToken ? { captchaToken } : undefined
            });
            try { window.turnstile && window.turnstile.reset(); } catch (e) {}

            if (error) {
                console.log(error);
                const msg = error.message || "";
                // 이메일 미인증 → 인증메일 재발송으로 자가복구 (인증메일 못 받아 막힌 유저 구제)
                if (error.code === "email_not_confirmed" || /not confirmed/i.test(msg)) {
                    if (confirm("이메일 인증이 아직 안 됐어요.\n인증 메일을 다시 보내드릴까요?")) {
                        try {
                            const rToken = (window.turnstile && window.turnstile.getResponse()) || undefined;
                            const { error: rErr } = await supabase.auth.resend({ type: "signup", email: emailVal, options: rToken ? { captchaToken: rToken } : undefined });
                            try { window.turnstile && window.turnstile.reset(); } catch (e) {}
                            if (rErr) throw rErr;
                            alert("인증 메일을 보냈어요! ✉️\n메일함(스팸함도)을 확인하고 링크를 눌러 인증을 완료해주세요.");
                        } catch (rE) {
                            const m = (rE && rE.message) || "";
                            if (/rate/i.test(m)) alert("잠시 후 다시 시도해주세요. (짧은 시간에 여러 번 요청됨)");
                            else alert("재발송에 실패했어요. 잠시 후 다시 시도해주세요.");
                        }
                    }
                    return;
                }
                alert("로그인 실패: " + msg);
                return;
            }

            // 다음 방문 이메일 자동 채움용 저장
            try { localStorage.setItem("galla_last_email", emailVal); } catch (e) {}

            // 단계별 위트 환영: 로그인 누적 횟수를 세어 index에서 welcome.js가 인사
            try {
                const n = (parseInt(localStorage.getItem("galla_login_count") || "0", 10) || 0) + 1;
                localStorage.setItem("galla_login_count", String(n));
                // 갓 가입(가입 직후 첫 로그인)이면 'new' 우선
                if (localStorage.getItem("galla_fresh_signup")) {
                    localStorage.removeItem("galla_fresh_signup");
                    localStorage.setItem("galla_welcome_pending", "new");
                } else {
                    localStorage.setItem("galla_welcome_pending", String(n));
                }
            } catch (e) {}
            done();   // MPA: 앱/PWA는 셸로, 웹은 index로 / SPA: 스택 pop + next 라우트
        });
    }

    /* ====================================================================
       MPA(단독 문서) — 기존 동작 그대로 (pop-out·히스토리 트랩·스와이프 홈 포함)
    ==================================================================== */
    function bootMPA() {
        // 로그인 후 돌아갈 곳(gated 탭/페이지) — ?next= 우선, 없으면 같은 오리진 referrer.
        function _computeLoginNext() {
            try {
                const p = new URLSearchParams(location.search).get("next");
                if (p) return p;
            } catch (_) {}
            try {
                const r = document.referrer;
                if (r && new URL(r).origin === location.origin) {
                    const u = new URL(r);
                    const path = u.pathname.replace(/^\//, "");
                    if (path && !/login\.html|app-shell\.html/.test(path)) return path + u.search;
                }
            } catch (_) {}
            return null;
        }
        const LOGIN_NEXT = _computeLoginNext();
        try { if (LOGIN_NEXT) sessionStorage.setItem("galla_login_next", LOGIN_NEXT); } catch (_) {}

        // 🧭 셸 판(iframe) 안에서 로그인이 열렸으면 → 풀스크린으로 튀어나온다.
        //    (그러지 않으면 셸 하단 nav가 로그인 화면 위에 남아 로그아웃 상태로 탭을 눌러대는
        //     '뒤로가기 미로'가 된다 — 사장님 제보 2026-07-24.)
        (function popOutOfShell() {
            try {
                if (window.top !== window.self && window.top.document.getElementById("shell-track")) {
                    const nx = LOGIN_NEXT ? "?next=" + encodeURIComponent(LOGIN_NEXT) : "";
                    window.top.location.replace("login.html" + nx);
                }
            } catch (_) { /* 크로스오리진 등 — 무시 */ }
        })();

        // 🔙 로그인 취소(뒤로) — pop-out(replace)으로 히스토리가 비어 history.back()이 먹통이었다
        //    (버튼·제스처 모두 무반응, 사장님 제보). 명시적으로 '공개 홈'으로 보낸다.
        function _cancelLogin() {
            const isAppEnv = (window.GALLA_isApp && GALLA_isApp()) ||
                (matchMedia && matchMedia("(display-mode: standalone)").matches);
            location.replace(isAppEnv ? "app-shell.html?tab=index" : "index.html");
        }
        // 백 버튼: back.js(history 기반) 대신 캡처 단계에서 먼저 잡아 명시 이동
        document.querySelectorAll(".auth-back").forEach(function (b) {
            b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); _cancelLogin(); }, true);
        });
        // 기기/제스처 back 트랩: 히스토리 항목을 하나 심고, 뒤로가면 홈으로.
        try {
            history.pushState({ galla_login: 1 }, "", location.href);
            window.addEventListener("popstate", _cancelLogin);
        } catch (_) {}

        // 👉👈 수평 스와이프 → 홈 (사장님 요청) — 네이티브 WebView는 iOS 가장자리 back 제스처가
        //    history.back을 안 쏘는 경우가 많아, '방향 무관' 수평 스와이프를 직접 감지한다.
        //    document 캡처 단계에 붙여 입력창 위에서도 잡히게(로그인엔 가로 스크롤 UI가 없어 안전).
        (function loginSwipeHome() {
            var x0 = null, y0 = null, t0 = 0;
            document.addEventListener("touchstart", function (e) {
                if (e.touches.length !== 1) { x0 = null; return; }
                x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
            }, { passive: true, capture: true });
            document.addEventListener("touchend", function (e) {
                if (x0 == null) return;
                var t = e.changedTouches[0];
                var dx = t.clientX - x0, dy = t.clientY - y0, dt = Date.now() - t0;
                x0 = null;
                // 좌/우 어느 쪽이든 충분한 수평 스와이프 + 세로 흔들림보다 가로 우세 + 빠르게 → 홈
                if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 800) _cancelLogin();
            }, { passive: true, capture: true });
            // 마우스 드래그(데스크톱/디버그)도 지원
            var mx = null, my = null, mt = 0;
            document.addEventListener("mousedown", function (e) { mx = e.clientX; my = e.clientY; mt = Date.now(); }, true);
            document.addEventListener("mouseup", function (e) {
                if (mx == null) return;
                var dx = e.clientX - mx, dy = e.clientY - my, dt = Date.now() - mt; mx = null;
                if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 800) _cancelLogin();
            }, true);
        })();

        /* 로그인 후 어디로 — 앱/PWA(셸 환경)는 반드시 셸로 복귀해야 한다.
           ⚠️ index.html로 보내면 앱이 셸 밖(MPA)에서 돌게 돼 조그·스와이프가
           셸과 다르게 동작 — '로그인 후 조그 먹통, 재시작하면 정상'(사장님 재현)의 원인.
           판(iframe) 안에서 로그인했으면 셸 전체를 새로 열어 모든 판이 세션을 받게 한다. */
        function goHome() {
            const inShell = window.top !== window.self;
            const isAppEnv = (window.GALLA_isApp && GALLA_isApp()) ||
                (matchMedia && matchMedia("(display-mode: standalone)").matches);
            // 원래 가려던 곳(next) 복원 — gated 탭(DM·마이 등)을 눌러 로그인했으면 거기로.
            let next = null;
            try { next = new URLSearchParams(location.search).get("next") || sessionStorage.getItem("galla_login_next"); } catch (_) {}
            try { sessionStorage.removeItem("galla_login_next"); } catch (_) {}
            const TAB = { "index.html": "index", "galla-predict.html": "predict", "dm.html": "dm", "search.html": "trend", "mypage.html": "mypage" };
            const base = next ? next.split("?")[0] : null;

            if (isAppEnv) {
                // 앱/PWA: 반드시 셸로 복귀(셸 밖이면 조그·스와이프 먹통). next가 탭이면 그 탭을 연다.
                let dest = "app-shell.html";
                if (base && TAB[base]) dest = "app-shell.html?tab=" + TAB[base];
                if (inShell) { try { window.top.location.href = dest; return; } catch (_) {} }
                location.replace(dest);
            } else {
                // 웹 브라우저(MPA): next 페이지로 그대로, 없으면 홈.
                // 🔒 오픈 리다이렉트 차단 — 외부 URL·프로토콜상대(//)·javascript: 등은 무시하고 홈으로.
                //    같은 사이트 상대경로(dm.html, /dm.html?x)만 허용.
                const safeNext = (next && !/^https?:/i.test(next) && !/^\/\//.test(next) && !/^[a-z]+:/i.test(next)) ? next : "index.html";
                location.replace(safeNext);
            }
        }

        initLoginForm(document, goHome);
    }

    /* ====================================================================
       SPA(app.html) — 스택 뷰. 문서를 떠나지 않는다.
       완료/취소 = GALLA_SPA.pop(), next는 탭이면 go(tab), 아니면 push(라우트).
    ==================================================================== */
    const SPA_TAB_OF_URL = { "index.html": "index", "galla-predict.html": "predict", "dm.html": "dm", "search.html": "trend", "mypage.html": "mypage" };
    const SPA_TABS = ["index", "predict", "dm", "trend", "mypage"];

    function spaDone(next) {
        // 🔄 로그인 성공 = SPA 1회 리부트 — 비로그인 상태로 이미 mount된 탭들(피드·뱃지·GP 등)이
        //    통째로 낡아 있어, 부분 갱신 대신 세션 반영된 새 부팅이 가장 확실하다(1회뿐이라 저렴).
        //    next가 탭이면 그 탭으로, 스택 라우트면 해당 라우트로 착지.
        let hash = "#/index";
        if (next) {
            const base = String(next).split("?")[0];
            const q = String(next).split("?")[1] || "";
            if (SPA_TAB_OF_URL[base]) hash = "#/" + SPA_TAB_OF_URL[base];
            else if (SPA_TABS.indexOf(base) !== -1) hash = "#/" + base;
            else {
                const m = base.match(/^\.?\/?([a-z0-9_-]+)(?:\.html)?$/i);
                if (m) hash = "#/" + m[1] + (q ? "?" + q : "");
            }
        }
        // 해시만 먼저 세팅(같은 문서라 리로드 아님) → 한 번만 리로드해 세션 반영된 새 부팅.
        // (예전엔 location.replace + reload를 연달아 불러 이중 네비 레이스로 블랙아웃되던 버그)
        try { location.hash = hash; } catch (_) {}
        try { location.reload(); } catch (_) {}
    }

    window.GALLA_PAGE_LOGIN = {
        _root: null,
        async mount(root, params) {
            this._root = root || document;
            const scope = this._root;
            const next = (params && params.next) || null;

            // 🔙 뒤로(취소) = 스택 pop — MPA의 _cancelLogin(문서 이동) 대신
            scope.querySelectorAll(".auth-back").forEach(function (b) {
                if (b.dataset.spaBound) return;
                b.dataset.spaBound = "1";
                b.addEventListener("click", function (e) {
                    e.preventDefault(); e.stopPropagation();
                    try { window.GALLA_SPA && window.GALLA_SPA.pop(); } catch (_) {}
                }, true);
            });

            // 👁 비밀번호 표시/숨김 — MPA에선 login.html 인라인 스크립트 담당(SPA에선 로더가 제거)
            scope.querySelectorAll(".pw-toggle").forEach(function (b) {
                if (b.dataset.spaBound) return;
                b.dataset.spaBound = "1";
                b.addEventListener("click", function () {
                    var i = scope.querySelector("#" + b.dataset.for);
                    if (!i) return;
                    var show = i.type === "password";
                    i.type = show ? "text" : "password";
                    b.textContent = show ? "🙈" : "👁";
                    b.classList.toggle("on", show);
                });
            });

            // 간편 로그인 버튼 — social-auth.js의 DOMContentLoaded는 SPA에선 이미 지나감 → 명시 렌더
            try {
                const btn = scope.querySelector("#loginBtn");
                if (btn && window.GALLA_renderSocialButtons) window.GALLA_renderSocialButtons(btn.parentElement);
            } catch (_) {}

            await initLoginForm(scope, () => spaDone(next));
        },
        unmount() {
            // 폼 리스너는 전부 root 내부 요소 소속 — 뷰 제거와 함께 해제. 문서/히스토리 트랩은 SPA에선 안 심는다.
            this._root = null;
        },
    };

    if (!IS_SPA) bootMPA();
})();
