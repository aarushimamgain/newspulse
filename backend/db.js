const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(__dirname, 'newspulse.sqlite');

const db = new Database(dbPath);

// Enable WAL mode for better concurrency between Python scraper & Node.js
db.pragma('journal_mode = WAL');

// Ensure tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    source TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,
    published_at TEXT NOT NULL,
    cluster_id INTEGER,
    FOREIGN KEY(cluster_id) REFERENCES clusters(id)
  );
`);

module.exports = db;
