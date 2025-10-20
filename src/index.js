import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import lark from "@larksuiteoapi/node-sdk";
import { saveMessage } from "./db.js";

dotenv.config();
const app = express();
app.use(express.json());

// -------------------- LARK CLIENT --------------------
const client = new lark.Client({
  appId: process.env.LARK_APP_ID,
  appSecret: process.env.LARK_APP_SECRET,
  appType: lark.AppType.SelfBuilt,
  domain: lark.Domain.Lark,
});

// -------------------- GEMINI --------------------
async function askGemini(prompt) {
  try {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      { contents: [{ parts: [{ text: prompt }] }] },
      { params: { key: process.env.GEMINI_KEY } }
    );

    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ Tidak ada jawaban dari Gemini.";
  } catch (err) {
    console.error("Gemini error:", err.response?.data || err.message);
    return "⚠️ Terjadi error saat memanggil Gemini API.";
  }
}

// -------------------- KIRIM PESAN --------------------
async function sendMessage(chatId, text) {
  try {
    await client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: { receive_id: chatId, msg_type: "text", content: JSON.stringify({ text }) },
    });
  } catch (err) {
    console.error("Send message error:", err);
  }
}

// -------------------- LARK WEBHOOK --------------------
app.post("/api/lark", async (req, res) => {
  const body = req.body;
  if (body.type === "url_verification") return res.json({ challenge: body.challenge });
  res.status(200).send();

  try {
    const event = body?.event;
    if (!event?.message) return;

    const message = JSON.parse(event.message.content).text.trim();
    const chatId = event.message.chat_id;
    const sessionId = chatId + "_" + event.sender.sender_id.user_id;

    console.log(`[DEBUG] New message: ${message}`);
    const reply = await askGemini(message);
    await saveMessage(sessionId, message, reply);
    await sendMessage(chatId, reply);
  } catch (err) {
    console.error("Webhook error:", err);
  }
});

app.get("/", (req, res) => res.send("✅ Lark Bot + Gemini + Firebase is running!"));
export default app;
