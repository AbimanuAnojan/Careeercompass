const express = require("express");
const { verifyFirebaseToken } = require("../middleware/authMiddleware");
const { saveQuizResultForUser, getQuizResultsForUser } = require("../services/firestoreService");
const { generate12thBlueprint } = require("../services/quizBlueprintService");

const router = express.Router();

router.post("/save-quiz", verifyFirebaseToken, async (req, res) => {
  try {
    const payload = req.body || {};

    // Simple validation for required quiz context.
    if (!payload.level && !payload.resultTitle) {
      return res.status(400).json({
        error: "Provide at least level or resultTitle in quiz payload."
      });
    }

    const quizId = await saveQuizResultForUser(req.user.uid, {
      level: payload.level,
      resultTitle: payload.resultTitle,
      resultSummary: payload.resultSummary,
      score: payload.score,
      answers: payload.answers,
      raw: payload.raw
    });

    return res.json({
      success: true,
      quizId
    });
  } catch (error) {
    console.error("POST /api/save-quiz failed:", error.message);
    return res.status(500).json({
      error: "Failed to save quiz result."
    });
  }
});

router.get("/quiz-results", verifyFirebaseToken, async (req, res) => {
  try {
    const parsedLimit = Number(req.query.limit);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 100)
      : 25;

    const quizResults = await getQuizResultsForUser(req.user.uid, limit);
    return res.json({ quizResults });
  } catch (error) {
    console.error("GET /api/quiz-results failed:", error.message);
    return res.status(500).json({
      error: "Failed to load quiz results."
    });
  }
});

router.post("/quiz-blueprint", verifyFirebaseToken, async (req, res) => {
  try {
    const level = typeof req.body?.level === "string" ? req.body.level.trim() : "";
    const answers = req.body?.answers && typeof req.body.answers === "object" ? req.body.answers : null;

    if (level !== "12th") {
      return res.status(400).json({
        error: "Only level='12th' is currently supported."
      });
    }

    if (!answers) {
      return res.status(400).json({
        error: "answers object is required."
      });
    }

    const blueprint = await generate12thBlueprint(answers);
    return res.json({ blueprint });
  } catch (error) {
    console.error("POST /api/quiz-blueprint failed:", error.message);
    return res.status(500).json({
      error: "Failed to generate 12th blueprint."
    });
  }
});

module.exports = router;
