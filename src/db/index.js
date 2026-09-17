const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const dbPath = path.resolve(process.cwd(), process.env.DATABASE_PATH || './data/leads.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Enable WAL mode (Write-Ahead Logging) for safe concurrent reads/writes across multiple agent processes
db.pragma('journal_mode = WAL');
// Set a 5-second busy timeout so concurrent writers wait instead of throwing SQLITE_BUSY
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

module.exports = db;
