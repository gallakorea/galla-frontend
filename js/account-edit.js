document.addEventListener("DOMContentLoaded", () => {

    const input = document.getElementById("profileInput");
    const preview = document.getElementById("profilePreview");

    input.addEventListener("change", () => {
        const file = input.files[0];
        if (file) {
            preview.src = URL.createObjectURL(file);
        }
    });

    document.querySelector(".save-btn").addEventListener("click", () => {
        alert("계정 정보가 저장되었습니다.");
        history.back();
    });

});