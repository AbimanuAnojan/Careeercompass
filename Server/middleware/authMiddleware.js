const { adminAuth } = require("../config/firebaseAdmin");
const { env } = require("../config/env");

function parseBearerToken(authHeader) {
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!bearerMatch) {
    return "";
  }

  // Some clients accidentally wrap tokens in quotes.
  return bearerMatch[1].trim().replace(/^"+|"+$/g, "");
}

function mapFirebaseRestError(rawMessage) {
  const message = String(rawMessage || "").trim();
  const code = message.includes(":") ? message.split(":")[0] : message;

  switch (code) {
    case "INVALID_ID_TOKEN":
      return {
        code: "auth/invalid-id-token",
        error: "Invalid or expired Firebase ID token."
      };
    case "USER_DISABLED":
      return {
        code: "auth/user-disabled",
        error: "This Firebase user account is disabled."
      };
    case "USER_NOT_FOUND":
      return {
        code: "auth/user-not-found",
        error: "No Firebase user exists for this token."
      };
    case "INVALID_API_KEY":
    case "API_KEY_INVALID":
      return {
        code: "auth/invalid-api-key",
        error: "FIREBASE_WEB_API_KEY is invalid for Firebase Auth."
      };
    case "API_KEY_SERVICE_BLOCKED":
      return {
        code: "auth/api-key-service-blocked",
        error: "FIREBASE_WEB_API_KEY is blocked for Identity Toolkit API."
      };
    case "PROJECT_NUMBER_MISMATCH":
    case "CREDENTIAL_MISMATCH":
      return {
        code: "auth/project-mismatch",
        error: "Firebase token belongs to a different Firebase project."
      };
    default:
      return {
        code: "auth/internal-error",
        error: message || "Firebase token verification failed."
      };
  }
}

async function verifyWithFirebaseRest(idToken) {
  if (!env.firebaseWebApiKey) {
    throw new Error("FIREBASE_WEB_API_KEY is missing.");
  }

  if (typeof fetch !== "function") {
    throw new Error("Global fetch is unavailable. Use Node.js 18+.");
  }

  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.firebaseWebApiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
    signal: AbortSignal.timeout(6000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const mapped = mapFirebaseRestError(data?.error?.message);
    const error = new Error(mapped.error);
    error.code = mapped.code;
    throw error;
  }

  const user = Array.isArray(data?.users) ? data.users[0] : null;
  if (!user?.localId) {
    const error = new Error("Firebase token verification returned no user.");
    error.code = "auth/internal-error";
    throw error;
  }

  return {
    uid: user.localId,
    email: user.email || null
  };
}

function shouldTryRestFallback(adminError) {
  const code = String(adminError?.code || "");
  const msg = String(adminError?.message || "").toLowerCase();

  // If token itself is invalid/expired/revoked, fallback won't help.
  if (
    code === "auth/invalid-id-token" ||
    code === "auth/id-token-expired" ||
    code === "auth/id-token-revoked" ||
    code === "auth/argument-error"
  ) {
    return false;
  }

  // Fallback is useful mainly when Admin SDK/project credential linkage is the issue.
  return (
    msg.includes("incorrect \"aud\" claim") ||
    msg.includes("incorrect aud claim") ||
    msg.includes("incorrect \"iss\" claim") ||
    msg.includes("incorrect iss claim") ||
    msg.includes("project id") ||
    msg.includes("invalid credential") ||
    code === "auth/invalid-credential" ||
    code === "auth/internal-error"
  );
}

async function verifyWithAdminSdk(idToken) {
  const timeoutMs = 7000;
  try {
    return await Promise.race([
      adminAuth.verifyIdToken(idToken),
      new Promise((_, reject) => {
        setTimeout(() => {
          const error = new Error(`Firebase Admin token verification timed out after ${timeoutMs}ms.`);
          error.code = "auth/network-timeout";
          reject(error);
        }, timeoutMs);
      })
    ]);
  } catch (error) {
    throw error;
  }
}

async function verifyFirebaseToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const idToken = parseBearerToken(authHeader);

    if (!idToken) {
      return res.status(401).json({
        error: "Missing Authorization header. Use: Bearer <Firebase ID Token>."
      });
    }

    try {
      const decodedToken = await verifyWithAdminSdk(idToken);
      req.user = decodedToken;
      return next();
    } catch (adminError) {
      // Fallback for local/dev setups where Admin SDK credentials/project linkage
      // can fail while the Firebase client ID token itself is still valid.
      if (env.firebaseWebApiKey && shouldTryRestFallback(adminError)) {
        try {
          const decodedViaRest = await verifyWithFirebaseRest(idToken);
          req.user = decodedViaRest;
          return next();
        } catch (_restError) {
          // Preserve the Admin SDK error path if REST fallback fails.
          throw adminError;
        }
      }
      throw adminError;
    }
  } catch (error) {
    const errorCode = error?.code || "auth/internal-error";
    const lowerMessage = String(error?.message || "").toLowerCase();
    let errorMessage = "Invalid or expired Firebase ID token.";

    if (errorCode === "auth/id-token-expired") {
      errorMessage = "Firebase ID token expired. Please login again.";
    } else if (errorCode === "auth/id-token-revoked") {
      errorMessage = "Firebase ID token was revoked. Please login again.";
    } else if (errorCode === "auth/network-timeout") {
      errorMessage = "Auth verification timed out. Check server network access to Firebase.";
    } else if (
      lowerMessage.includes("incorrect \"aud\" claim") ||
      lowerMessage.includes("incorrect aud claim") ||
      lowerMessage.includes("incorrect \"iss\" claim") ||
      lowerMessage.includes("incorrect iss claim")
    ) {
      errorMessage = "Firebase project mismatch between frontend token and backend Admin SDK configuration.";
    }

    console.error(`Token verification failed [${errorCode}]:`, error.message);
    return res.status(401).json({
      error: errorMessage,
      code: errorCode
    });
  }
}

module.exports = { verifyFirebaseToken };
