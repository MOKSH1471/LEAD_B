const fs = require('fs');
const path = require('path');
const db = require('./index');

function runMigration() {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  console.log('🔄 [DB Migration] Running schema migration...');
  db.exec(schemaSql);
  console.log('✅ [DB Migration] All database tables and indexes created successfully in data/leads.db');
}

if (require.main === module) {
  try {
    runMigration();
    process.exit(0);
  } catch (err) {
    console.error('❌ [DB Migration Failed]:', err);
    process.exit(1);
  }
}

module.exports = { runMigration };
