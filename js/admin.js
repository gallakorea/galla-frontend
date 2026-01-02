/* ===========================================================
   admin.js
   - 대시보드 통계 로딩
   - 신고/유저/이슈 관리 탭 전환
   - 리스트 렌더링
   - 검색 필터
   - 승인/거절/삭제/정지 등 액션
   - 상세보기 모달
=========================================================== */

/* -----------------------------------------------------------
   DOM
----------------------------------------------------------- */
const adminTabs = document.querySelectorAll(".admin-tab");
const adminList = document.querySelector(".admin-list");
const adminSearchInput = document.querySelector(".admin-search-input");

/* -----------------------------------------------------------
   더미 관리자 데이터
----------------------------------------------------------- */
const adminStats = {
    reports: 12,
    newUsers: 45,
    issues: 128,
    todayVotes: 982
};

const reportList = [
    { id: 1, title: "부적절한 발언 신고", meta: "5분 전 · 사용자: abc" },
    { id: 2, title: "허위 정보 신고", meta: "1시간 전 · 사용자: kim" }
];

const userList = [
    { id: 101, title: "홍길동 (정지됨)", meta: "가입: 2023-11-02" },
    { id: 102, title: "김서준", meta: "신고 2회 누적" }
];

const issueList = [
    { id: 201, title: "점심 지원금 확대해야?", meta: "발의자: 박민수" },
    { id: 202, title: "전기차 보조금 폐지?", meta: "발의자: 이서준" }
];

/* -----------------------------------------------------------
   1) 통계 로딩
----------------------------------------------------------- */
window.addEventListener("DOMContentLoaded", () => {
    document.querySelector(".stat-reports").textContent = adminStats.reports;
    document.querySelector(".stat-users").textContent = adminStats.newUsers;
    document.querySelector(".stat-issues").textContent = adminStats.issues;
    document.querySelector(".stat-votes").textContent = adminStats.todayVotes;

    loadAdminTab("reports");
});

/* -----------------------------------------------------------
   2) 탭 전환
----------------------------------------------------------- */
adminTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        adminTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        loadAdminTab(tab.dataset.tab);
    });
});

/* -----------------------------------------------------------
   3) 리스트 렌더링
----------------------------------------------------------- */
function loadAdminTab(tab) {
    adminList.innerHTML = "";

    let list = [];
    if (tab === "reports") list = reportList;
    if (tab === "users") list = userList;
    if (tab === "issues") list = issueList;

    if (list.length === 0) {
        adminList.innerHTML = "<p style='color:#777;text-align:center;'>데이터 없음</p>";
        return;
    }

    list.forEach((item) => {
        adminList.innerHTML += `
            <div class="admin-row">
                <div class="admin-row-title">${item.title}</div>
                <div class="admin-row-meta">${item.meta}</div>
                <div class="admin-row-actions">
                    <button class="admin-btn btn-detail" data-id="${item.id}" data-type="${tab}">자세히</button>
                    <button class="admin-btn btn-approve" data-id="${item.id}" data-type="${tab}">승인</button>
                    <button class="admin-btn btn-reject" data-id="${item.id}" data-type="${tab}">거절</button>
                </div>
            </div>
        `;
    });
}

/* -----------------------------------------------------------
   4) 검색 필터
----------------------------------------------------------- */
adminSearchInput?.addEventListener("input", () => {
    const keyword = adminSearchInput.value.trim();

    if (!keyword) {
        const activeTab = document.querySelector(".admin-tab.active").dataset.tab;
        loadAdminTab(activeTab);
        return;
    }

    const activeTab = document.querySelector(".admin-tab.active").dataset.tab;

    let source = [];
    if (activeTab === "reports") source = reportList;
    if (activeTab === "users") source = userList;
    if (activeTab === "issues") source = issueList;

    const filtered = source.filter((item) =>
        item.title.includes(keyword) || item.meta.includes(keyword)
    );

    adminList.innerHTML = "";
    filtered.forEach((item) => {
        adminList.innerHTML += `
        <div class="admin-row">
            <div class="admin-row-title">${item.title}</div>
            <div class="admin-row-meta">${item.meta}</div>
            <div class="admin-row-actions">
                <button class="admin-btn btn-detail" data-id="${item.id}" data-type="${activeTab}">자세히</button>
                <button class="admin-btn btn-approve" data-id="${item.id}" data-type="${activeTab}">승인</button>
                <button class="admin-btn btn-reject" data-id="${item.id}" data-type="${activeTab}">거절</button>
            </div>
        </div>`;
    });
});

/* -----------------------------------------------------------
   5) 상세 모달 / 승인 / 거절 처리
----------------------------------------------------------- */
let modalOverlay, modalBox;

document.addEventListener("click", (e) => {
    const detailBtn = e.target.closest(".btn-detail");
    const approveBtn = e.target.closest(".btn-approve");
    const rejectBtn = e.target.closest(".btn-reject");

    if (detailBtn) openAdminModal(detailBtn.dataset.id, detailBtn.dataset.type);
    if (approveBtn) alert("승인 완료!");
    if (rejectBtn) alert("거절 처리됨.");
});

function openAdminModal(id, type) {
    if (!modalOverlay) {
        modalOverlay = document.createElement("div");
        modalOverlay.className = "admin-modal-overlay";

        modalBox = document.createElement("div");
        modalBox.className = "admin-modal";

        document.body.appendChild(modalOverlay);
        document.body.appendChild(modalBox);

        modalOverlay.addEventListener("click", closeAdminModal);
    }

    modalBox.innerHTML = `
        <h3>상세 정보</h3>
        <p>ID: ${id}<br>TYPE: ${type}<br>추가 정보 로딩 가능</p>
        <div class="admin-modal-btns">
            <button class="modal-close">닫기</button>
            <button class="modal-action">삭제</button>
        </div>
    `;

    modalOverlay.classList.add("active");
    modalBox.classList.add("active");

    modalBox.querySelector(".modal-close").addEventListener("click", closeAdminModal);
    modalBox.querySelector(".modal-action").addEventListener("click", () => {
        alert("삭제 처리되었습니다.");
        closeAdminModal();
    });
}

function closeAdminModal() {
    modalOverlay.classList.remove("active");
    modalBox.classList.remove("active");
}