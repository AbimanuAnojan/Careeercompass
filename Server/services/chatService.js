const { generateGrokContent } = require("../config/grokClient");

function parseHistoryPayload(historyPayload) {
  let turns = [];
  let location = null;

  if (Array.isArray(historyPayload)) {
    // Supports both: [turns, location] and plain turns array.
    turns = Array.isArray(historyPayload[0]) ? historyPayload[0] : historyPayload;

    if (
      Array.isArray(historyPayload[1]) &&
      historyPayload[1].length >= 2 &&
      Number.isFinite(Number(historyPayload[1][0])) &&
      Number.isFinite(Number(historyPayload[1][1]))
    ) {
      location = {
        lat: Number(historyPayload[1][0]),
        lng: Number(historyPayload[1][1])
      };
    }
  }

  const safeTurns = (Array.isArray(turns) ? turns : [])
    .filter((turn) => turn && typeof turn.text === "string" && turn.text.trim())
    .slice(-20)
    .map((turn) => ({
      role: turn.role === "assistant" ? "assistant" : "user",
      text: turn.text.trim()
    }));

  return { turns: safeTurns, location };
}

function buildGrokMessages({ message, historyTurns, location }) {
  const systemInstructionParts = [
    "You are CareerCompass AI, a practical and supportive career mentor.",
    "Give clear, step-by-step answers for students."
  ];

  if (location) {
    systemInstructionParts.push(
      `Location context: ${location.lat}, ${location.lng}. Use this only when relevant.`
    );
  }

  const messages = [];

  historyTurns.forEach((turn) => {
    messages.push({
      role: turn.role === "assistant" ? "assistant" : "user",
      content: turn.text
    });
  });

  messages.unshift({
    role: "system",
    content: systemInstructionParts.join(" ")
  });

  messages.push({
    role: "user",
    content: message
  });

  return { messages };
}

function extractGrokReply(response) {
  const choices = Array.isArray(response?.choices) ? response.choices : [];
  for (const choice of choices) {
    const content = choice?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
  }

  return "";
}

function buildFallbackReply() {
  return "I could not generate a full response right now. Please try again in a moment, and I can still guide you step by step.";
}

function dedupeTrailingMessageTurn(turns, messageText) {
  const normalizedMessage = String(messageText || "").trim();
  if (!normalizedMessage || !Array.isArray(turns) || turns.length === 0) {
    return Array.isArray(turns) ? turns : [];
  }

  const lastTurn = turns[turns.length - 1];
  if (
    lastTurn &&
    lastTurn.role === "user" &&
    String(lastTurn.text || "").trim() === normalizedMessage
  ) {
    return turns.slice(0, -1);
  }

  return turns;
}

function buildErrorReply(error) {
  const status = String(error?.status || "");
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "");

  if (status === "401" || status === "403" || message.toLowerCase().includes("unauthorized")) {
    return "API key is invalid for the selected provider. If your key starts with gsk_, use Groq-compatible settings.";
  }

  if (status === "429" || message.includes("quota") || message.includes("rate limit")) {
    return "Grok API quota or rate limit has been hit. Please retry in about a minute.";
  }

  if (status === "404" || code.includes("model_not_found") || message.includes("not found")) {
    return "The configured Grok model is unavailable right now. Please update GROK_MODEL in server env.";
  }

  return buildFallbackReply();
}

async function generateChatReply({ message, history }) {
  const normalizedMessage = String(message || "").trim();
  const { turns, location } = parseHistoryPayload(history);
  const historyTurns = dedupeTrailingMessageTurn(turns, normalizedMessage);
  const { messages } = buildGrokMessages({
    message: normalizedMessage,
    historyTurns,
    location
  });

  let reply = "";
  try {
    const response = await generateGrokContent({ messages });
    reply = extractGrokReply(response);
  } catch (error) {
    reply = buildErrorReply(error);
  }

  if (!reply) {
    reply = buildFallbackReply();
  }

  const updatedHistorySnapshot = [
    ...historyTurns,
    { role: "user", text: normalizedMessage },
    { role: "assistant", text: reply }
  ].slice(-30);

  return {
    reply,
    historySnapshot: updatedHistorySnapshot,
    location
  };
}

module.exports = { generateChatReply };
