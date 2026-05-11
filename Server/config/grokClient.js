const { env } = require("./env");

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";
const GROQ_CHAT_COMPLETIONS_URL = "https://api.groq.com/openai/v1/chat/completions";

function getProviderFromKey(apiKey) {
  if (typeof apiKey === "string" && apiKey.startsWith("gsk_")) {
    return "groq";
  }
  return "xai";
}

function getChatCompletionsUrl() {
  if (env.grokBaseUrl && env.grokBaseUrl.trim()) {
    return `${env.grokBaseUrl.replace(/\/+$/, "")}/chat/completions`;
  }

  return getProviderFromKey(env.grokApiKey) === "groq"
    ? GROQ_CHAT_COMPLETIONS_URL
    : XAI_CHAT_COMPLETIONS_URL;
}

function getConfiguredModelName(modelName, provider) {
  if (!modelName || !modelName.trim()) {
    return provider === "groq" ? "llama-3.3-70b-versatile" : "grok-3-mini";
  }
  return modelName.trim();
}

function buildModelCandidates() {
  const provider = getProviderFromKey(env.grokApiKey);
  const configuredModel = getConfiguredModelName(env.grokModel, provider);
  const providerDefaults =
    provider === "groq"
      ? ["llama-3.3-70b-versatile", "openai/gpt-oss-20b"]
      : ["grok-3-mini", "grok-3"];

  return Array.from(new Set([configuredModel, ...providerDefaults])).filter(Boolean);
}

function parseGrokError(responseStatus, payload) {
  const errorPayload = payload && typeof payload === "object" ? payload.error : null;
  const status = Number(responseStatus || 0);
  const code = String(errorPayload?.code || "");
  const message = String(
    errorPayload?.message ||
      payload?.message ||
      `Model API request failed with status ${status || "unknown"}.`
  );

  return {
    status,
    code,
    message
  };
}

function shouldTryNextModel(modelError) {
  const status = Number(modelError?.status || 0);
  const code = String(modelError?.code || "").toLowerCase();
  return status === 404 || status === 429 || code.includes("model_not_found");
}

async function callGrokChatCompletions({ model, messages }) {
  const response = await fetch(getChatCompletionsUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.grokApiKey}`
    },
    body: JSON.stringify({
      model,
      messages: Array.isArray(messages) ? messages : [],
      temperature: 0.4,
      stream: false
    })
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }

  if (!response.ok) {
    const modelError = parseGrokError(response.status, payload);
    const error = new Error(modelError.message);
    error.status = modelError.status;
    error.code = modelError.code;
    throw error;
  }

  return payload;
}

async function generateGrokContent({ messages }) {
  if (!env.grokApiKey) {
    throw new Error("GROK_API_KEY is missing in environment variables.");
  }

  const models = buildModelCandidates();
  let lastError = null;

  for (let i = 0; i < models.length; i += 1) {
    const model = models[i];
    try {
      return await callGrokChatCompletions({ model, messages });
    } catch (error) {
      lastError = error;
      const canRetryAnotherModel = shouldTryNextModel(error) && i < models.length - 1;
      if (!canRetryAnotherModel) {
        throw error;
      }
    }
  }

  throw lastError || new Error("Model API request failed.");
}

module.exports = { generateGrokContent };
