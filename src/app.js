import express from "express";
import mongoose from "mongoose";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { checkS3Connectivity } from "./utils/s3.js";
import authRouter from "./routes/auth.routes.js";
import uploadRouter from "./routes/upload.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import courseRoutes from "./routes/course.routes.js";
import tutorRoutes from "./routes/tutor.routes.js";
import adminRouter from "./routes/admin.routes.js";
import enrollmentRoutes from "./routes/enrollment.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import learningRouter from "./routes/learning.routes.js";
import messageRoutes from "./routes/message.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import lmsRoutes from "./routes/lms.routes.js";
import { renderApiDocs } from "./controllers/docs.controller.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";

const app = express();

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows inline CSS/JS in docs.html
  })
);

// Cross-Origin Resource Sharing (Multi-Origin Support)
const allowedOrigins = (env.FRONTEND_ORIGINS && env.FRONTEND_ORIGINS.length > 0)
  ? env.FRONTEND_ORIGINS
  : ["http://localhost:3000"];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

// Body parser: 16kb everywhere, with a larger limit only for routes that carry student/instructor source code
// (rawBody is preserved for webhook signature verification).
const keepRawBody = (req, res, buf) => {
  req.rawBody = buf;
};
const smallJson = express.json({ limit: "16kb", verify: keepRawBody });
const codeJson = express.json({ limit: "1mb", verify: keepRawBody });
// Assignment write-ups (up to 20,000 characters) and authored lessons/quizzes need more than 16kb, but far less than code labs.
const contentJson = express.json({ limit: "256kb", verify: keepRawBody });
const CONTENT_PATHS = [/^\/api\/lms\/assignments\/[^/]+\/submit$/, /^\/api\/lms\/admin\/(lessons|quizzes|assignments)(\/|$)/];
const CODE_PATHS = [/^\/api\/lms\/code-labs(\/|$)/, /^\/api\/lms\/live-sessions\/[^/]+\/shared-code$/, /^\/api\/lms\/admin\/code-labs(\/|$)/];
app.use((req, res, next) => {
  if (CODE_PATHS.some((pattern) => pattern.test(req.path))) return codeJson(req, res, next);
  if (CONTENT_PATHS.some((pattern) => pattern.test(req.path))) return contentJson(req, res, next);
  return smallJson(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// Interactive HTML API Documentation Portal
app.get("/", renderApiDocs);

// Health checks. /api/health is kept for backward compatibility.
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// Liveness: the process is up and answering (no dependency checks).
app.get("/api/health/liveness", (req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

// Readiness: dependencies are reachable (MongoDB, and S3 when configured).
app.get("/api/health/readiness", async (req, res) => {
  const mongo = mongoose.connection.readyState === 1 ? "ok" : "error";
  const s3 = await checkS3Connectivity();
  const ready = mongo === "ok" && s3 !== "error";
  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "unavailable",
    checks: { mongodb: mongo, s3 },
  });
});

// Mount auth routes under /api/auth
app.use("/api/auth", authRouter);

// Mount upload routes under /api/upload
app.use("/api/upload", uploadRouter);

// Mount tutor onboarding & analytics routes under /api/tutor
app.use("/api/tutor", tutorRoutes);

// Mount admin routes under /api/admin
app.use("/api/admin", adminRouter);

// Mount enrollment routes under /api/enrollments
app.use("/api/enrollments", enrollmentRoutes);

// Mount webhook routes under /api/webhooks
app.use("/api/webhooks", webhookRoutes);

// Mount learning engine routes under /api/learning
app.use("/api/learning", learningRouter);

// Mount messaging routes under /api/messages
app.use("/api/messages", messageRoutes);

// Mount notification routes under /api/notifications
app.use("/api/notifications", notificationRoutes);

// Mount the trimester LMS under /api/lms
app.use("/api/lms", lmsRoutes);

// Mount category taxonomy & course catalog routes under /api
app.use("/api", categoryRoutes);
app.use("/api", courseRoutes);


// Global 404 handler for unmatched routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Centralized error handler
app.use(errorMiddleware);

export { app };
export default app;
