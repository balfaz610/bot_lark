import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import sqlite3 from "better-sqlite3";
import lark from "@larksuiteoapi/node-sdk";

dotenv.config();

// -------------------- INIT --------------------
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// -------------------- DATABASE --------------------
const db = new sqlite3("db.sqlite");
db.prepare(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    question TEXT,
    answer TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

console.log("✅ Database initialized");

// -------------------- LARK CLIENT --------------------
const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

// -------------------- GEMINI AI --------------------
async function askGemini(prompt) {
  try {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        contents: [{ parts: [{ text: prompt }] }],
      },
      {
        params: { key: process.env.GEMINI_KEY },
      }
    );

    return (
      res.data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ Tidak ada jawaban dari Gemini."
    );
  } catch (err) {
    console.error("Gemini error:", err.response?.data || err.message);
    return "⚠️ Terjadi error saat memanggil Gemini API.";
  }
}

// -------------------- SEND MESSAGE TO LARK --------------------
async function sendMessage(chatId, text) {
  try {
    await client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });
  } catch (err) {
    console.error("Send message error:", err);
  }
}

// -------------------- LARK WEBHOOK --------------------
app.post("/api/lark", async (req, res) => {
  const body = req.body;

  // ✅ Step 1: Handle URL verification dari Lark
  if (body.type === "url_verification") {
    return res.json({ challenge: body.challenge });
  }

  // ✅ Step 2: Handle event/message biasa
  res.status(200).send(); // supaya Lark gak timeout

  try {
    const event = body?.event;
    if (!event?.message) return;

    const message = JSON.parse(event.message.content).text.trim();
    const chatId = event.message.chat_id;
    const sessionId = chatId + "_" + event.sender.sender_id.user_id;

    console.log(`[DEBUG] New message: ${message}`);

    // Jawaban dari Gemini
    const reply = await askGemini(message);

    // Simpan ke DB
    db.prepare(
      "INSERT INTO messages (session_id, question, answer) VALUES (?, ?, ?)"
    ).run(sessionId, message, reply);

    // Kirim balik ke user
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

// -------------------- TEST ENDPOINT --------------------
app.get("/", (req, res) => res.send("✅ Lark Bot + Gemini is running!"));

// -------------------- START SERVER --------------------
app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
