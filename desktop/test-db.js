const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'data', 'livegalgame.db');

console.log('DB Path:', dbPath);

try {
  const db = new Database(dbPath);
  console.log('Current audio sources:');
  const stmt = db.prepare('SELECT * FROM audio_sources ORDER BY created_at ASC');
  const result = stmt.all();
  console.log(JSON.stringify(result, null, 2));
  db.close();
} catch (error) {
  console.error('Error:', error.message);
}
