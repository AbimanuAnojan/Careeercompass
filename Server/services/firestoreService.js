const { db, FieldValue } = require("../config/firebaseAdmin");

function getUserDocRef(uid) {
  return db.collection("users").doc(uid);
}

function getChatsCollectionRef(uid) {
  return getUserDocRef(uid).collection("chats");
}

function getQuizResultsCollectionRef(uid) {
  return getUserDocRef(uid).collection("quizResults");
}

function serializeTimestamp(maybeTimestamp) {
  if (!maybeTimestamp || typeof maybeTimestamp.toDate !== "function") {
    return null;
  }
  return maybeTimestamp.toDate().toISOString();
}

async function saveChatForUser(uid, payload) {
  const chatRef = getChatsCollectionRef(uid).doc();

  await chatRef.set({
    userMessage: payload.userMessage,
    assistantReply: payload.assistantReply,
    location: payload.location || null,
    historySnapshot: payload.historySnapshot || [],
    createdAt: FieldValue.serverTimestamp()
  });

  return chatRef.id;
}

async function getChatsForUser(uid, limit = 25) {
  const snapshot = await getChatsCollectionRef(uid)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      userMessage: data.userMessage || "",
      assistantReply: data.assistantReply || "",
      historySnapshot: Array.isArray(data.historySnapshot) ? data.historySnapshot : [],
      location: data.location || null,
      createdAt: serializeTimestamp(data.createdAt)
    };
  });
}

async function saveQuizResultForUser(uid, quizPayload) {
  const quizRef = getQuizResultsCollectionRef(uid).doc();

  await quizRef.set({
    level: quizPayload.level || null,
    resultTitle: quizPayload.resultTitle || null,
    resultSummary: quizPayload.resultSummary || null,
    score: typeof quizPayload.score === "number" ? quizPayload.score : null,
    answers: quizPayload.answers || {},
    raw: quizPayload.raw || null,
    createdAt: FieldValue.serverTimestamp()
  });

  return quizRef.id;
}

async function getQuizResultsForUser(uid, limit = 25) {
  const snapshot = await getQuizResultsCollectionRef(uid)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      level: data.level || null,
      resultTitle: data.resultTitle || null,
      resultSummary: data.resultSummary || null,
      score: typeof data.score === "number" ? data.score : null,
      answers: data.answers || {},
      raw: data.raw || null,
      createdAt: serializeTimestamp(data.createdAt)
    };
  });
}

module.exports = {
  saveChatForUser,
  getChatsForUser,
  saveQuizResultForUser,
  getQuizResultsForUser
};
