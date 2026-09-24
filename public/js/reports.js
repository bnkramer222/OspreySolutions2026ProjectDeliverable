const uploadForm = document.getElementById("upload-form");
const uploadButton = document.getElementById("upload-button");
const uploadMessage = document.getElementById("upload-message");
const fileInput = document.getElementById("dataset-file");
const datasetSelect = document.getElementById("dataset-select");
const datasetMessage = document.getElementById("dataset-message");
const noDatasets = document.getElementById("no-datasets");
const generateButton = document.getElementById("generate-button");
const reportCard = document.getElementById("report-card");

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function showMessage(element, text, type) {
    element.textContent = text;
    element.className = `message ${type}`;
    element.hidden = false;
}

function hideMessage(element) {
    element.textContent = "";
    element.hidden = true;
}

function resetReport() {
    reportCard.hidden = true;
    document.getElementById("report-head").replaceChildren();
    document.getElementById("report-body").replaceChildren();
}

function setButtonBusy(button, busy, busyText, readyText) {
    button.disabled = busy;
    button.textContent = busy ? busyText : readyText;
}

function createDatasetOption(dataset) {
    const option = document.createElement("option");
    option.value = String(dataset.id);
    option.textContent = `${dataset.filename} — ${dataset.recordCount} records — ${formatDate(dataset.uploadedAt)}`;
    return option;
}

async function loadDatasets(preferredDatasetId) {
    datasetSelect.disabled = true;
    generateButton.disabled = true;
    noDatasets.hidden = true;
    showMessage(datasetMessage, "Loading uploaded datasets...", "info");

    try {
        const response = await fetch("/api/report-datasets");
        if (!response.ok) {
            throw new Error("Unable to load uploaded datasets.");
        }

        const data = await response.json();
        const datasets = Array.isArray(data.datasets) ? data.datasets : [];
        datasetSelect.replaceChildren();

        if (datasets.length === 0) {
            const emptyOption = document.createElement("option");
            emptyOption.textContent = "No datasets uploaded";
            datasetSelect.appendChild(emptyOption);
            noDatasets.hidden = false;
            hideMessage(datasetMessage);
            resetReport();
            return;
        }

        datasets.forEach((dataset) => datasetSelect.appendChild(createDatasetOption(dataset)));
        datasetSelect.disabled = false;
        generateButton.disabled = false;

        if (preferredDatasetId !== undefined) {
            datasetSelect.value = String(preferredDatasetId);
        }

        hideMessage(datasetMessage);
    } catch (error) {
        datasetSelect.replaceChildren();
        const errorOption = document.createElement("option");
        errorOption.textContent = "Datasets unavailable";
        datasetSelect.appendChild(errorOption);
        showMessage(datasetMessage, error.message, "error");
        resetReport();
    }
}

function renderReport(report) {
    document.getElementById("report-filename").textContent = report.filename;
    document.getElementById("report-count").textContent = String(report.recordCount);
    document.getElementById("report-date").textContent = formatDate(report.uploadedAt);

    const reportHead = document.getElementById("report-head");
    const reportBody = document.getElementById("report-body");
    const reportEmpty = document.getElementById("report-empty");
    const tableScroll = document.getElementById("table-scroll");
    reportHead.replaceChildren();
    reportBody.replaceChildren();

    const headingRow = document.createElement("tr");
    report.headers.forEach((header) => {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = String(header);
        headingRow.appendChild(cell);
    });
    reportHead.appendChild(headingRow);

    report.records.forEach((record) => {
        const row = document.createElement("tr");
        record.forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value === null || value === undefined ? "" : String(value);
            row.appendChild(cell);
        });
        reportBody.appendChild(row);
    });

    const isEmpty = report.records.length === 0;
    reportEmpty.hidden = !isEmpty;
    tableScroll.hidden = isEmpty;
    reportCard.hidden = false;
}

uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideMessage(uploadMessage);

    const file = fileInput.files[0];
    if (!file) {
        showMessage(uploadMessage, "Choose a CSV file to upload.", "error");
        return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
        showMessage(uploadMessage, "Only .csv files can be uploaded.", "error");
        return;
    }

    const formData = new FormData();
    formData.append("dataset", file);
    setButtonBusy(uploadButton, true, "Uploading...", "Upload Dataset");

    try {
        const response = await fetch("/api/report-datasets", {
            method: "POST",
            body: formData
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || "Unable to upload the dataset.");
        }

        fileInput.value = "";
        resetReport();
        showMessage(uploadMessage, `${data.dataset.filename} uploaded successfully.`, "success");
        await loadDatasets(data.dataset.id);
    } catch (error) {
        showMessage(uploadMessage, error.message, "error");
    } finally {
        setButtonBusy(uploadButton, false, "Uploading...", "Upload Dataset");
    }
});

datasetSelect.addEventListener("change", resetReport);

generateButton.addEventListener("click", async () => {
    const datasetId = datasetSelect.value;
    if (!datasetId) {
        showMessage(datasetMessage, "Select an uploaded dataset.", "error");
        return;
    }

    resetReport();
    showMessage(datasetMessage, "Generating report...", "info");
    setButtonBusy(generateButton, true, "Generating...", "Generate Report");

    try {
        const response = await fetch(`/api/report-datasets/${encodeURIComponent(datasetId)}/report`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "Unable to generate the report.");
        }

        renderReport(data);
        hideMessage(datasetMessage);
    } catch (error) {
        showMessage(datasetMessage, error.message, "error");
    } finally {
        setButtonBusy(generateButton, false, "Generating...", "Generate Report");
    }
});

loadDatasets();
