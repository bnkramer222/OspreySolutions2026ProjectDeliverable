const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "osprey-report-test-"));
process.env.VMS_DB_PATH = path.join(temporaryDirectory, "test.db");

const app = require("../app");
const db = require("../db/database");

let server;
let baseUrl;
let sessionCookie;

before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, "127.0.0.1", () => {
            baseUrl = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });
});

after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

async function authenticatedFetch(url, options = {}) {
    return fetch(`${baseUrl}${url}`, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Cookie: sessionCookie
        }
    });
}

async function uploadCsv(contents, filename) {
    const form = new FormData();
    form.append("dataset", new Blob([contents], { type: "text/csv" }), filename);
    return authenticatedFetch("/api/report-datasets", {
        method: "POST",
        body: form
    });
}

test("report routes require an authenticated admin", async () => {
    const pageResponse = await fetch(`${baseUrl}/reports`, { redirect: "manual" });
    assert.equal(pageResponse.status, 302);
    assert.equal(pageResponse.headers.get("location"), "/");

    const apiResponse = await fetch(`${baseUrl}/api/report-datasets`, { redirect: "manual" });
    assert.equal(apiResponse.status, 302);
    assert.equal(apiResponse.headers.get("location"), "/");
});

test("admin can upload, list, and report on valid CSV datasets", async () => {
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@test.com", password: "p123" })
    });
    assert.equal(loginResponse.status, 200);
    sessionCookie = loginResponse.headers.get("set-cookie").split(";", 1)[0];

    const csv = "\uFEFFName,Notes,Details\r\n\"Smith, Jane\",\"Line one\nLine two\",\"<script>alert(1)</script>\"\r\nJosé,\"Said \"\"hello\"\"\",Plain";
    const uploadResponse = await uploadCsv(csv, "people.csv");
    assert.equal(uploadResponse.status, 201);
    const upload = await uploadResponse.json();
    assert.equal(upload.dataset.filename, "people.csv");
    assert.equal(upload.dataset.recordCount, 2);

    const listResponse = await authenticatedFetch("/api/report-datasets");
    assert.equal(listResponse.status, 200);
    const list = await listResponse.json();
    assert.equal(list.datasets.length, 1);
    assert.equal(list.datasets[0].id, upload.dataset.id);

    const reportResponse = await authenticatedFetch(`/api/report-datasets/${upload.dataset.id}/report`);
    assert.equal(reportResponse.status, 200);
    const report = await reportResponse.json();
    assert.deepEqual(report.headers, ["Name", "Notes", "Details"]);
    assert.deepEqual(report.records, [
        ["Smith, Jane", "Line one\nLine two", "<script>alert(1)</script>"],
        ["José", "Said \"hello\"", "Plain"]
    ]);

    const secondResponse = await uploadCsv("Code,Value\nA,1\nB,2\nC,3", "metrics.csv");
    assert.equal(secondResponse.status, 201);
    const second = await secondResponse.json();
    assert.equal(second.dataset.recordCount, 3);

    const secondReportResponse = await authenticatedFetch(`/api/report-datasets/${second.dataset.id}/report`);
    const secondReport = await secondReportResponse.json();
    assert.equal(secondReport.filename, "metrics.csv");
    assert.deepEqual(secondReport.records, [["A", "1"], ["B", "2"], ["C", "3"]]);
});

test("invalid uploads fail without storing partial datasets", async () => {
    const missingFile = await authenticatedFetch("/api/report-datasets", {
        method: "POST",
        body: new FormData()
    });
    assert.equal(missingFile.status, 400);
    assert.match((await missingFile.json()).error, /Choose a CSV file/i);

    const invalidExtension = await uploadCsv("Name\nAlice", "people.txt");
    assert.equal(invalidExtension.status, 400);
    assert.match((await invalidExtension.json()).error, /Only \.csv/);

    const oversizedFile = await uploadCsv(Buffer.alloc((5 * 1024 * 1024) + 1, "a"), "oversized.csv");
    assert.equal(oversizedFile.status, 413);
    assert.match((await oversizedFile.json()).error, /5 MB or smaller/i);

    const emptyFile = await uploadCsv("", "empty.csv");
    assert.equal(emptyFile.status, 400);
    assert.match((await emptyFile.json()).error, /empty/i);

    const headerOnly = await uploadCsv("Name,Email\n", "headers.csv");
    assert.equal(headerOnly.status, 400);
    assert.match((await headerOnly.json()).error, /data record/i);

    const blankHeader = await uploadCsv("Name, ,Email\nAlice,x,a@example.com", "blank-header.csv");
    assert.equal(blankHeader.status, 400);
    assert.match((await blankHeader.json()).error, /non-blank header/i);

    const malformed = await uploadCsv("Name,Notes\nAlice,\"unterminated", "malformed.csv");
    assert.equal(malformed.status, 400);
    assert.match((await malformed.json()).error, /malformed/i);

    const listResponse = await authenticatedFetch("/api/report-datasets");
    const list = await listResponse.json();
    assert.equal(list.datasets.length, 2);

    const unknownResponse = await authenticatedFetch("/api/report-datasets/999999/report");
    assert.equal(unknownResponse.status, 404);
    assert.deepEqual(await unknownResponse.json(), { error: "Dataset not found." });
});

test("existing authenticated pages and matching endpoints still respond", async () => {
    for (const page of ["/dashboard", "/volunteers", "/opportunities"]) {
        const response = await authenticatedFetch(page);
        assert.equal(response.status, 200, `${page} should load`);
    }

    const opportunity = db.prepare(`
        INSERT INTO opportunities (name, center, date, status)
        VALUES (?, ?, ?, ?)
    `).run("Test Opportunity", "Test Center", "2026-09-23", "Active");
    const volunteer = db.prepare(`
        INSERT INTO volunteers (first_name, last_name, username, password)
        VALUES (?, ?, ?, ?)
    `).run("Test", "Volunteer", "report-test-volunteer", "test-password");

    const addResponse = await authenticatedFetch(`/opportunities/${opportunity.lastInsertRowid}/matches/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volunteer_id: Number(volunteer.lastInsertRowid) })
    });
    assert.equal(addResponse.status, 200);

    const matchesResponse = await authenticatedFetch(`/opportunities/${opportunity.lastInsertRowid}/matches`);
    assert.equal(matchesResponse.status, 200);
    const matches = await matchesResponse.json();
    assert.equal(matches.matches.length, 1);
    assert.equal(matches.matches[0].username, "report-test-volunteer");
});
