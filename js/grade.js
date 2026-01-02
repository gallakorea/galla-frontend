document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".nav-item").forEach(el => {
        el.onclick = () => {
            location.href = el.dataset.target;
        };
    });
});