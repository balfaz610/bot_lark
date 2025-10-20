const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Pastikan folder data ada
const dbPath = path.join(__dirname, '..', 'data', 'messages.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath, { verbose: console.log });

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS events (
            event_id TEXT PRIMARY KEY,
            content TEXT
        );
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            question TEXT,
            answer TEXT,
            msg_size INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('✅ Database initialized successfully');
} catch (e) {
    console.error('❌ Failed to initialize database:', e.message);
    throw e;
}

module.exports = {
    events: {
        count: (eventId) => db.prepare('SELECT COUNT(*) as count FROM events WHERE event_id = ?').get(eventId).count,
        save: (eventId) => db.prepare('INSERT INTO events (event_id) VALUES (?)').run(eventId),
        findOne: (eventId) => db.prepare('SELECT * FROM events WHERE event_id = ?').get(eventId),
        update: (eventId, content) => db.prepare('UPDATE events SET content = ? WHERE event_id = ?').run(content, eventId)
    },
    messages: {
        find: (sessionId) => db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC').all(sessionId),
        save: ({ sessionId, question, answer, msgSize }) => db.prepare('INSERT INTO messages (session_id, question, answer, msg_size) VALUES (?, ?, ?, ?)').run(sessionId, question, answer, msgSize),
        delete: (id) => db.prepare('DELETE FROM messages WHERE id = ?').run(id),
        deleteMany: (sessionId) => db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId)
    }
};
