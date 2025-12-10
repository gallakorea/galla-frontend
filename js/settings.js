document.addEventListener("DOMContentLoaded", () => {
    console.log("Settings Loaded");

    // 네비게이터 클릭 이동
    document.querySelectorAll(".nav-item").forEach(icon => {
        icon.addEventListener("click", () => {
            const target = icon.dataset.target;
            if (target !== "settings.html") {
                location.href = target;
            }
        });
    });
});