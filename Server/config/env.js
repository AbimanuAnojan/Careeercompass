const path = require("path");
const dotenv = require("dotenv");

// Load local environment values. Secrets should live only in .env files.
dotenv.config();
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function parseAllowedOrigins(rawOrigins) {
  if (!rawOrigins || rawOrigins.trim() === "") {
    return [];
  }

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const env = {
  port: Number(process.env.PORT || 3000),
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),

  // Grok
  grokApiKey: process.env.GROK_API_KEY || "",
  grokModel: process.env.GROK_MODEL || "grok-3-mini",
  grokBaseUrl: process.env.GROK_BASE_URL || "",

  // Firebase Admin options (you can use one of these approaches)
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY || "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || "",
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || "",
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ""
};

module.exports = { env };
