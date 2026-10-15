import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const createLimiter = (maxRequests, windowMinutes = 15) => {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    standardHeaders: true, // Draft-6 RateLimit headers and Retry-After
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: "Too many attempts, please try again later",
      });
    },
  });
};

export const signupLimiter = createLimiter(10);
export const signinLimiter = createLimiter(10);
export const resendVerificationLimiter = createLimiter(5);
export const verifyEmailLimiter = createLimiter(10);
export const forgotPasswordLimiter = createLimiter(5);
export const verifyOtpLimiter = createLimiter(10);
export const resetPasswordLimiter = createLimiter(5);
export const updatePasswordLimiter = createLimiter(10);
export const updateProfileLimiter = createLimiter(30);

// Per-user limiters for the LMS (keyed by user id, falling back to IP). Auth runs before these.
const createUserLimiter = (maxRequests, windowMinutes, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user?._id ? `user:${req.user._id}` : ipKeyGenerator(req.ip)),
    handler: (req, res) => res.status(429).json({ error: message }),
  });

export const liveChatLimiter = createUserLimiter(40, 1, "You're sending messages too quickly. Please slow down.");
export const inquiryLimiter = createUserLimiter(10, 60, "You've submitted several inquiries recently. Please wait a while before sending another.");
export const codeSubmissionLimiter = createUserLimiter(30, 15, "Too many submissions. Please wait a few minutes.");
export const lessonCommentLimiter = createUserLimiter(40, 1, "You're commenting too quickly. Please slow down.");
export const quizAttemptLimiter = createUserLimiter(20, 15, "Too many quiz submissions. Please wait a few minutes.");
export const assignmentSubmitLimiter = createUserLimiter(20, 15, "Too many submissions. Please wait a few minutes.");
export const communityWriteLimiter = createUserLimiter(30, 15, "You're posting too quickly. Please wait a few minutes.");

// Backward compatibility exports
export const authLimiter = signinLimiter;
export const otpLimiter = verifyEmailLimiter;

export default {
  signupLimiter,
  signinLimiter,
  resendVerificationLimiter,
  verifyEmailLimiter,
  forgotPasswordLimiter,
  verifyOtpLimiter,
  resetPasswordLimiter,
  updatePasswordLimiter,
  updateProfileLimiter,
  authLimiter,
  otpLimiter,
};
