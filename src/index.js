import express from "express";
import axios from "axios";
import sqlite3 from "sqlite3";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// Database SQLite
const db = new sqlite3.Database("./db.sqlite");
db.run(`CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  question TEXT,
  answer TEXT,
  msg_size REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`);

// Logger
function logger(...msg) {
  console.log("[DEBUG]", ...msg);
}

// Gemini reply function
async function getGeminiReply(prompt) {
  const GEMINI_KEY = process.env.GEMINI_KEY;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!GEMINI_KEY) return "⚠️ Gemini API key belum diatur di .env";

  const userPrompt =
    prompt.map(p => `${p.role === "user" ? "User" : "Assistant"}: ${p.content}`).join("\n") +
    "\nAssistant:";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: userPrompt }] }]
  };

  try {
    const res = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000
    });
    const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    logger("🤖 Gemini response:", text);
    return text?.trim() || "⚠️ Tidak ada jawaban dari Gemini.";
  } catch (err) {
    logger("❌ Gemini error:", err.response?.data || err.message);
    return `⚠️ Error dari Gemini: ${err.response?.data?.error?.message || err.message}`;
  }
}

// Handler Lark webhook
app.post("/webhook", async (req, res) => {
  const body = req.body;

  // Step 1: handle verification
  if (body?.type === "url_verification") {
    logger("🔗 Lark verification request");
    return res.send({ challenge: body.challenge });
  }

  // Step 2: handle incoming messages
  if (body?.header?.event_type === "im.message.receive_v1") {
    const event = body.event;
    const chatId = event.message.chat_id;
    const content = JSON.parse(event.message.content);
    const text = content.text.trim();
    const senderId = event.sender.sender_id.user_id;
    const sessionId = chatId + senderId;

    logger("📩 Incoming message:", text);

    // Simpan pertanyaan
    db.run(
      `INSERT INTO messages (session_id, question, msg_size) VALUES (?, ?, ?)`,
      [sessionId, text, text.length],
      err => {
        if (err) logger("DB insert error:", err);
      }
    );

    // Buat prompt
    const conversation = [
      { role: "user", content: text }
    ];

    // Dapatkan jawaban dari Gemini
    const reply = await getGeminiReply(conversation);

    // Simpan jawaban ke DB
    db.run(
      `UPDATE messages SET answer = ? WHERE session_id = ? AND question = ?`,
      [reply, sessionId, text]
    );

    // Kirim balasan ke Lark
    await sendLarkReply(chatId, reply);

    logger("➡ Sent reply to Lark:", reply);
  }

  res.send("ok");
});

// Fungsi kirim pesan ke Lark
async function sendLarkReply(chatId, text) {
  const appId = process.env.APP_ID;
  const appSecret = process.env.APP_SECRET;

  // Dapatkan access token
  const tokenRes = await axios.post(
    "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
    { app_id: appId, app_secret: appSecret },
    { headers: { "Content-Type": "application/json" } }
  );

  const accessToken = tokenRes.data.tenant_access_token;

  // Kirim pesan ke Lark
  await axios.post(
    "https://open.larksuite.com/open-apis/im/v1/messages",
    {
      receive_id_type: "chat_id",
      content: JSON.stringify({ text }),
      msg_type: "text",
      receive_id: chatId
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
