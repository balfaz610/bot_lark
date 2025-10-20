import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const firebaseConfigPath = process.env.FIREBASE_CONFIG_PATH || path.join(__dirname, "..", "firebase-key.json");

if (!fs.existsSync(firebaseConfigPath)) throw new Error("Firebase config file tidak ditemukan!");

const serviceAccount = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

export async function saveMessage(sessionId, question, answer) {
  await db.collection("messages").add({
    sessionId,
    question,
    answer,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log("💾 Message saved to Firestore");
}

export async function getMessages(sessionId) {
  const snapshot = await db
    .collection("messages")
    .where("sessionId", "==", sessionId)
    .orderBy("createdAt", "desc")
    .get();

  return snapshot.docs.map((doc) => doc.data());
}

console.log("✅ Firebase connected successfully");
