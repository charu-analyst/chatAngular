// mysqlservices.js
import mysql from 'mysql2/promise';

const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'charu4699',
  database: 'chat_support'
};

const pool = mysql.createPool(dbConfig);

// Create a new user session
export async function createUserSession(sessionId) {
  console.log("session====",sessionId);
  
  const [result] = await pool.execute(
    'INSERT INTO user_sessions (id) VALUES (?) ON DUPLICATE KEY UPDATE last_active = CURRENT_TIMESTAMP',
    [sessionId]
  );
  return sessionId;
}

// Update session activity
export async function updateSessionActivity(sessionId) {
  await pool.execute(
    'UPDATE user_sessions SET last_active = CURRENT_TIMESTAMP WHERE id = ?',
    [sessionId]
  );
}


export async function createMessage(text, sessionId, sender = 'user') {
  try {
    console.log("Storing message:", text, "SESSION:", sessionId);

    // Session must update before insert
    await updateSessionActivity(sessionId);

    const [result] = await pool.execute(
      `INSERT INTO messages (session_id, text, sender) VALUES (?, ?, ?)`,
      [sessionId, text, sender]
    );

    return {
      id: result.insertId,
      session_id: sessionId,
      text,
      sender,
      created_at: new Date()
    };

  } catch (error) {
    console.error("❌ Error saving message to DB:", error);
    throw error;
  }
}

// Get messages by session - FIXED PARAMETERS
export async function getMessagesBySession(sessionId, limit = 50) {
  const safeLimit = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
  const query = `
    SELECT id, session_id, text, sender, created_at 
    FROM messages 
    WHERE session_id = ? 
    ORDER BY created_at ASC 
    LIMIT ${safeLimit}
  `;

  const [rows] = await pool.execute(query, [sessionId]);
  return rows;
}

// Get all messages (for admin view)
export async function getAllMessages(limit = 50) {
  const [rows] = await pool.execute(
    'SELECT id, session_id, text, sender, created_at FROM messages ORDER BY created_at DESC LIMIT ?',
    [limit]
  );
  return rows;
}

// Get active sessions
export async function getActiveSessions(hours = 24) {
  const [rows] = await pool.execute(
    'SELECT id, created_at, last_active FROM user_sessions WHERE last_active >= DATE_SUB(NOW(), INTERVAL ? HOUR) ORDER BY last_active DESC',
    [hours]
  );
  return rows;
}