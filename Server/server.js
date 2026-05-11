const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const { env } = require("./config/env");
const chatRoutes = require("./routes/chatRoutes");
const quizRoutes = require("./routes/quizRoutes");

const app = express();

const corsOptions = {
  origin: env.allowedOrigins,
  methods: ["GET", "POST"],
  credentials: true
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api", apiLimiter);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    message: "CareerCompass backend is running."
  });
});

app.use("/api", chatRoutes);
app.use("/api", quizRoutes);

app.use((err, _req, res, _next) => {
  console.error("Unhandled server error:", err);
  res.status(err.statusCode || 500).json({
    error: err.publicMessage || "Something went wrong on the server."
  });
});

app.listen(env.port, () => {
  console.log(`Secure API server running on port ${env.port}`);
});
