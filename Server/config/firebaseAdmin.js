const fs = require("fs");
const path = require("path");
const { initializeApp, cert, applicationDefault, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const { env } = require("./env");

function loadServiceAccountFromEnv() {
  if (env.firebaseServiceAccountJson) {
    return JSON.parse(env.firebaseServiceAccountJson);
  }

  if (env.firebaseServiceAccountPath) {
    const resolvedPath = path.isAbsolute(env.firebaseServiceAccountPath)
      ? env.firebaseServiceAccountPath
      : path.join(__dirname, "..", env.firebaseServiceAccountPath);
    const fileContent = fs.readFileSync(resolvedPath, "utf8");
    return JSON.parse(fileContent);
  }

  if (env.firebaseProjectId && env.firebaseClientEmail && env.firebasePrivateKey) {
    return {
      projectId: env.firebaseProjectId,
      clientEmail: env.firebaseClientEmail,
      privateKey: env.firebasePrivateKey.replace(/\\n/g, "\n")
    };
  }

  return null;
}

function initFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccount = loadServiceAccountFromEnv();
  const appOptions = {};

  if (env.firebaseProjectId) {
    appOptions.projectId = env.firebaseProjectId;
  }

  if (serviceAccount) {
    return initializeApp({
      ...appOptions,
      credential: cert(serviceAccount)
    });
  }

  // Works automatically on Cloud Run / App Hosting / Functions if default credentials exist.
  return initializeApp({
    ...appOptions,
    credential: applicationDefault()
  });
}

const firebaseApp = initFirebaseAdmin();
const adminAuth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

module.exports = { adminAuth, db, FieldValue };
