document.addEventListener("DOMContentLoaded", () => {

    // DAILY QUEST DATA
    const dailyQuests = [
        { id: 1, icon: "📝", title: "오늘 1개 발의하기", sub: "+30 GP", reward: 30, goal: 1, progress: 0 },
        { id: 2, icon: "👍", title: "찬반 투표 5회", sub: "+20 GP", reward: 20, goal: 5, progress: 0 },
        { id: 3, icon: "💬", title: "댓글 3개 작성", sub: "+25 GP", reward: 25, goal: 3, progress: 0 }
    ];

    // WEEKLY QUESTS
    const weeklyQuests = [
        { id: 101, title: "이번 주 10개 투표", sub: "+40 GP", reward: 40, goal: 10, progress: 0 },
        { id: 102, title: "발의 3개 완성", sub: "+60 GP", reward: 60, goal: 3, progress: 0 },
        { id: 103, title: "댓글 15개 작성", sub: "+50 GP", reward: 50, goal: 15, progress: 0 }
    ];

    const dailyWrapper = document.getElementById("daily-list");
    const weeklyWrapper = document.getElementById("weekly-list");

    /* ---------- RENDER DAILY ---------- */
    function renderDaily() {
        dailyWrapper.innerHTML = "";
        dailyQuests.forEach(q => {
            let percent = (q.progress / q.goal) * 100;

            dailyWrapper.innerHTML += `
                <div class="quest-card ${q.progress >= q.goal ? "completed" : ""}" data-id="${q.id}">
                    <div class="quest-top">
                        <div class="quest-icon">${q.icon}</div>
                        <div>
                            <div class="quest-title">${q.title}</div>
                            <div class="quest-sub">${q.sub}</div>
                        </div>
                    </div>

                    <div class="quest-progress">
                        ${q.progress} / ${q.goal}
                        <div class="bar"><div class="bar-fill" style="width:${percent}%"></div></div>
                    </div>
                </div>
            `;
        });
    }

    /* ---------- RENDER WEEKLY ---------- */
    function renderWeekly() {
        weeklyWrapper.innerHTML = "";
        weeklyQuests.forEach(q => {
            let percent = (q.progress / q.goal) * 100;

            weeklyWrapper.innerHTML += `
                <div class="weekly-card ${q.progress >= q.goal ? "completed" : ""}" data-id="${q.id}">
                    <div class="weekly-title">${q.title}</div>
                    <div class="weekly-sub">${q.sub}</div>
                    <div class="bar" style="margin-top:12px">
                        <div class="bar-fill" style="width:${percent}%"></div>
                    </div>
                    <div style="margin-top:6px; font-size:13px">${q.progress} / ${q.goal}</div>
                </div>
            `;
        });
    }

    /* ---------- TOTAL RING ---------- */
    function updateRing() {
        const total = dailyQuests.length;
        const cleared = dailyQuests.filter(q => q.progress >= q.goal).length;
        const percent = Math.round((cleared / total) * 100);

        document.getElementById("progress-percent").innerText = percent + "%";

        const offset = 440 - (440 * percent) / 100;
        document.querySelector(".ring-progress").style.strokeDashoffset = offset;
    }

    /* ---------- TODAY REWARD ---------- */
    function updateTodayReward() {
        const totalGP = dailyQuests.reduce((sum, q) => sum + q.reward, 0);
        const currentGP = dailyQuests.reduce((sum, q) => sum + (q.progress >= q.goal ? q.reward : 0), 0);

        document.getElementById("tr-total-gp").innerText = totalGP + " GP";
        document.getElementById("tr-progress-text").innerText = `${currentGP} / ${totalGP} GP`;

        const percent = (currentGP / totalGP) * 100;
        document.getElementById("tr-bar-fill").style.width = percent + "%";

        const claimBtn = document.getElementById("tr-claim-btn");

        if (currentGP >= totalGP) {
            claimBtn.classList.remove("disabled");
        } else {
            claimBtn.classList.add("disabled");
        }
    }

    /* ---------- CLICK EVENT (TEST) ---------- */
    function attachEvents() {
        document.querySelectorAll(".quest-card").forEach(card => {
            card.onclick = () => {
                const id = Number(card.dataset.id);
                let q = dailyQuests.find(x => x.id === id);

                if (q.progress < q.goal) {
                    q.progress++;
                }

                renderDaily();
                attachEvents();
                updateRing();
                updateTodayReward();
            };
        });
    }

    /* INIT */
    renderDaily();
    renderWeekly();
    attachEvents();
    updateRing();
    updateTodayReward();
});

document.querySelectorAll(".nav-item").forEach(icon => {
    icon.addEventListener("click", () => {
        const target = icon.dataset.target;
        if (target) location.href = target;
    });
});