const express = require("express");
const { verifyFirebaseToken } = require("../middleware/authMiddleware");
const { generateChatReply } = require("../services/chatService");
const { saveChatForUser, getChatsForUser } = require("../services/firestoreService");

const router = express.Router();

router.post("/chat", verifyFirebaseToken, async (req, res) => {
  try {
    const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
    if (!message) {
      return res.status(400).json({ error: "message is required." });
    }

    if (message.length > 4000) {
      return res.status(400).json({ error: "message is too long. Maximum 4000 characters." });
    }

    const { reply, historySnapshot, location } = await generateChatReply({
      message,
      history: req.body.history
    });

    const uid = req.user.uid;
    const chatId = await saveChatForUser(uid, {
      userMessage: message,
      assistantReply: reply,
      historySnapshot,
      location
    });

    return res.json({
      reply,
      chatId
    });
  } catch (error) {
    console.error("POST /api/chat failed:", error.message);
    return res.status(500).json({
      error: "Failed to generate chat response."
    });
  }
});

router.get("/chats", verifyFirebaseToken, async (req, res) => {
  try {
    const parsedLimit = Number(req.query.limit);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 25;

    const chats = await getChatsForUser(req.user.uid, limit);
    return res.json({ chats });
  } catch (error) {
    console.error("GET /api/chats failed:", error.message);
    return res.status(500).json({
      error: "Failed to load chats."
    });
  }
});

module.exports = router;
