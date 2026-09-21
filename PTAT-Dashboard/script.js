const fileInput = document.getElementById("fileInput");
const uploadButton = document.getElementById("uploadButton");
const latestFile = document.getElementById("latestFile");

uploadButton.addEventListener("click", function () {

    const file = fileInput.files[0];

    if (!file) {
        alert("Please select a file first.");
        return;
    }

    latestFile.textContent = file.name;

    alert("File uploaded successfully!");
});