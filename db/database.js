const Database = require("better-sqlite3");
const path = require("path");

const databasePath = process.env.VMS_DB_PATH || path.join(__dirname, "vms.db");
const db = new Database(databasePath);

db.pragma("foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        center TEXT NOT NULL,
        date TEXT NOT NULL,
        description TEXT,
        skills_needed TEXT,
        status TEXT DEFAULT 'Active'
    );

    CREATE TABLE IF NOT EXISTS volunteer_opportunity_matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        volunteer_id INTEGER,
        opportunity_id INTEGER
    );


    CREATE TABLE IF NOT EXISTS volunteers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    preferred_centers TEXT,
    skills_interests TEXT,
    availability_times TEXT,
    address TEXT,
    phone_numbers TEXT,
    email TEXT,
    educational_background TEXT,
    current_licenses TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_email TEXT,
    emergency_contact_address TEXT,
    drivers_license_on_file INTEGER DEFAULT 0,
    social_security_card_on_file INTEGER DEFAULT 0,
    approval_status TEXT DEFAULT 'Pending Approval'
    );

    CREATE TABLE IF NOT EXISTS report_datasets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        original_filename TEXT NOT NULL,
        headers_json TEXT NOT NULL,
        uploaded_at TEXT NOT NULL,
        record_count INTEGER NOT NULL CHECK (record_count >= 0)
    );

    CREATE TABLE IF NOT EXISTS report_dataset_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dataset_id INTEGER NOT NULL,
        row_index INTEGER NOT NULL,
        values_json TEXT NOT NULL,
        FOREIGN KEY (dataset_id) REFERENCES report_datasets(id) ON DELETE CASCADE,
        UNIQUE (dataset_id, row_index)
    );

    CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    );
`);

module.exports = db;
