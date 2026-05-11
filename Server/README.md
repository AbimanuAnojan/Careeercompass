# CareerCompass Secure Backend (Firebase Admin + Grok)

This backend moves sensitive logic to the server:
- Firebase ID token verification
- Firestore writes
- Grok API calls

Your frontend only calls secure API endpoints with `fetch()`.

---

## 1) Final Folder Structure

```txt
/Server
  /config
    env.js
    firebaseAdmin.js
    grokClient.js
  /middleware
    authMiddleware.js
  /routes
    chatRoutes.js
    quizRoutes.js
  /services
    chatService.js
    firestoreService.js
  .env.example
  .gitignore
  package.json
  server.js
```

---

## 2) Install Packages

Run these commands in `Server`:

```bash
npm install express cors helmet express-rate-limit dotenv firebase-admin
npm install --save-dev nodemon
```

---

## 3) Environment Setup

1. Create `.env` in `Server` from `.env.example`.
2. Add your Grok API key.
3. Add Firebase Admin credentials (recommended: `FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json`).

Example:

```env
PORT=3000
ALLOWED_ORIGINS=http://127.0.0.1:5500,http://localhost:5500
GROK_API_KEY=gsk-xxxx
GROK_MODEL=grok-3-mini
FIREBASE_SERVICE_ACCOUNT_PATH=./service-account.json
```

---

## 4) Firebase Service Account JSON Setup

1. Go to Firebase Console -> Project Settings -> Service Accounts.
2. Click **Generate new private key**.
3. Download JSON and place it at:
   - `Server/service-account.json`
4. Never commit this file to Git (already blocked in `.gitignore`).

Alternative: set `GOOGLE_APPLICATION_CREDENTIALS` in your host environment.

---

## 5) Start Server

```bash
npm run dev
```

or production:

```bash
npm start
```

Health check:

```txt
GET http://localhost:3000/health
```

---

## 6) API Routes (All Protected)

All routes require:

```txt
Authorization: Bearer <Firebase ID token>
```

### POST `/api/chat`

Request body:

```json
{
  "message": "I am in 12th, should I choose JEE or NEET?",
  "history": [
    [{"role":"user","text":"Hello"},{"role":"assistant","text":"Hi"}],
    [28.6139, 77.2090]
  ]
}
```

Response:

```json
{
  "reply": "AI answer...",
  "chatId": "autoDocId"
}
```

Stored in Firestore:

```txt
users/{uid}/chats/{chatId}
```

### GET `/api/chats?limit=25`

Response:

```json
{
  "chats": [
    {
      "id": "chatDocId",
      "userMessage": "...",
      "assistantReply": "...",
      "location": {"lat": 28.6, "lng": 77.2},
      "createdAt": "2026-05-07T10:30:00.000Z"
    }
  ]
}
```

### POST `/api/save-quiz`

Request body:

```json
{
  "level": "12th",
  "resultTitle": "Engineering Pathway",
  "resultSummary": "You are a strong match for PCM + JEE track",
  "score": 87,
  "answers": {
    "interest": "Technology",
    "strength": "Mathematics"
  },
  "raw": {
    "fullUiState": {}
  }
}
```

Response:

```json
{
  "success": true,
  "quizId": "autoDocId"
}
```

Stored in Firestore:

```txt
users/{uid}/quizResults/{quizId}
```

### GET `/api/quiz-results?limit=25`

Response:

```json
{
  "quizResults": [
    {
      "id": "quizDocId",
      "level": "12th",
      "resultTitle": "Engineering Pathway",
      "resultSummary": "...",
      "score": 87,
      "answers": {"interest":"Technology"},
      "raw": {},
      "createdAt": "2026-05-07T10:31:00.000Z"
    }
  ]
}
```

---

## 7) Frontend `fetch()` Examples

Use Firebase Auth on frontend and send ID token to backend.

```javascript
async function getAuthHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("User must be logged in.");
  const token = await user.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

async function sendChat(message, history) {
  const headers = await getAuthHeaders();
  const response = await fetch("http://localhost:3000/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({ message, history })
  });
  return response.json();
}

async function saveQuizResult(payload) {
  const headers = await getAuthHeaders();
  const response = await fetch("http://localhost:3000/api/save-quiz", {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  return response.json();
}

async function loadChats() {
  const headers = await getAuthHeaders();
  const response = await fetch("http://localhost:3000/api/chats?limit=25", {
    method: "GET",
    headers
  });
  return response.json();
}

async function loadQuizResults() {
  const headers = await getAuthHeaders();
  const response = await fetch("http://localhost:3000/api/quiz-results?limit=25", {
    method: "GET",
    headers
  });
  return response.json();
}
```

---

## 8) Firestore Security Rule Recommendations

These rules keep user data private.

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /chats/{chatId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }

      match /quizResults/{quizId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

Note:
- Admin SDK bypasses Firestore rules by design, so backend access still works.
- Rules protect client-side direct access.

---

## 9) Deployment Guide

### Option A: Render / Railway / Fly.io / VPS

1. Deploy `Server` folder as Node app.
2. Set environment variables in hosting dashboard:
   - `GROK_API_KEY`
   - `GROK_MODEL`
   - Firebase Admin credentials (`FIREBASE_SERVICE_ACCOUNT_JSON` recommended for cloud)
   - `ALLOWED_ORIGINS`
3. Start command:
   - `npm start`
4. Update frontend API base URL to deployed backend domain.

### Option B: Google Cloud Run

1. Build and deploy container for `Server`.
2. Set env vars in Cloud Run service.
3. Use service account with Firestore access.
4. Add your frontend domain to `ALLOWED_ORIGINS`.

---

## 10) Important Security Checklist

- Never expose Grok API key in frontend.
- Never expose Firebase Admin private key in frontend.
- Never accept `uid` from request body. Always use `req.user.uid`.
- Always verify Firebase ID token in middleware.
- Keep rate limiting enabled.
- Keep CORS restricted in production.
