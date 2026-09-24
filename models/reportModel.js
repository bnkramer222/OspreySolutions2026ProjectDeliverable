const db = require("../db/database");

const insertDataset = db.prepare(`
    INSERT INTO report_datasets (
        original_filename,
        headers_json,
        uploaded_at,
        record_count
    ) VALUES (?, ?, ?, ?)
`);

const insertRecord = db.prepare(`
    INSERT INTO report_dataset_records (dataset_id, row_index, values_json)
    VALUES (?, ?, ?)
`);

const importDataset = db.transaction(({ filename, headers, rows, uploadedAt }) => {
    const result = insertDataset.run(
        filename,
        JSON.stringify(headers),
        uploadedAt,
        rows.length
    );

    const datasetId = Number(result.lastInsertRowid);

    rows.forEach((row, index) => {
        insertRecord.run(datasetId, index, JSON.stringify(row));
    });

    return datasetId;
});

function toMetadata(dataset) {
    return {
        id: dataset.id,
        filename: dataset.original_filename,
        uploadedAt: dataset.uploaded_at,
        recordCount: dataset.record_count
    };
}

const reportModel = {
    listDatasets: () => {
        return db.prepare(`
            SELECT id, original_filename, uploaded_at, record_count
            FROM report_datasets
            ORDER BY uploaded_at DESC, id DESC
        `).all().map(toMetadata);
    },

    createDataset: (dataset) => {
        const id = importDataset(dataset);
        return reportModel.getDatasetMetadata(id);
    },

    getDatasetMetadata: (id) => {
        const dataset = db.prepare(`
            SELECT id, original_filename, uploaded_at, record_count
            FROM report_datasets
            WHERE id = ?
        `).get(id);

        return dataset ? toMetadata(dataset) : null;
    },

    getReport: (id) => {
        const dataset = db.prepare(`
            SELECT id, original_filename, headers_json, uploaded_at, record_count
            FROM report_datasets
            WHERE id = ?
        `).get(id);

        if (!dataset) {
            return null;
        }

        const records = db.prepare(`
            SELECT values_json
            FROM report_dataset_records
            WHERE dataset_id = ?
            ORDER BY row_index ASC
        `).all(id).map((record) => JSON.parse(record.values_json));

        return {
            ...toMetadata(dataset),
            headers: JSON.parse(dataset.headers_json),
            records
        };
    }
};

module.exports = reportModel;
