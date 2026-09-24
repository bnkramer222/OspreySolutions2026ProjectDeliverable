const { parse } = require("csv-parse/sync");
const reportModel = require("../models/reportModel");

function parseDatasetId(value) {
    if (!/^\d+$/.test(value)) {
        return null;
    }

    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseCsv(buffer) {
    let parsedRows;

    try {
        parsedRows = parse(buffer, {
            bom: true,
            skip_empty_lines: true
        });
    } catch (error) {
        const validationError = new Error("The CSV file is malformed. Check its quotes, columns, and row formatting.");
        validationError.status = 400;
        throw validationError;
    }

    if (parsedRows.length === 0) {
        const error = new Error("The CSV file is empty.");
        error.status = 400;
        throw error;
    }

    const headers = parsedRows[0];
    if (headers.length === 0 || headers.some((header) => String(header).trim() === "")) {
        const error = new Error("Every CSV column must have a non-blank header.");
        error.status = 400;
        throw error;
    }

    const rows = parsedRows.slice(1);
    if (rows.length === 0) {
        const error = new Error("The CSV file must contain at least one data record.");
        error.status = 400;
        throw error;
    }

    if (rows.some((row) => row.length !== headers.length)) {
        const error = new Error("Every CSV record must contain the same number of columns as the header row.");
        error.status = 400;
        throw error;
    }

    return { headers, rows };
}

const reportController = {
    listDatasets: (req, res) => {
        try {
            res.json({ datasets: reportModel.listDatasets() });
        } catch (error) {
            console.error("Unable to list report datasets:", error);
            res.status(500).json({ error: "Unable to load uploaded datasets." });
        }
    },

    uploadDataset: (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: "Choose a CSV file to upload." });
        }

        try {
            const { headers, rows } = parseCsv(req.file.buffer);
            const dataset = reportModel.createDataset({
                filename: req.file.originalname,
                headers,
                rows,
                uploadedAt: new Date().toISOString()
            });

            res.status(201).json({
                message: "Dataset uploaded successfully.",
                dataset
            });
        } catch (error) {
            if (error.status === 400) {
                return res.status(400).json({ error: error.message });
            }

            console.error("Unable to import report dataset:", error);
            res.status(500).json({ error: "Unable to upload the dataset." });
        }
    },

    getReport: (req, res) => {
        const datasetId = parseDatasetId(req.params.id);
        if (!datasetId) {
            return res.status(404).json({ error: "Dataset not found." });
        }

        try {
            const report = reportModel.getReport(datasetId);
            if (!report) {
                return res.status(404).json({ error: "Dataset not found." });
            }

            res.json(report);
        } catch (error) {
            console.error("Unable to generate dataset report:", error);
            res.status(500).json({ error: "Unable to generate the report." });
        }
    }
};

module.exports = reportController;
