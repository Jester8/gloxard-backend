import { Router } from "express";
import { authGuard } from "../middlewares/auth.middleware.js";
import { roleGuard } from "../middlewares/role.middleware.js";
import { requireTeacher, resolveCohort, resolveLiveSession } from "../middlewares/lms.middleware.js";
import { codeSubmissionLimiter, inquiryLimiter, liveChatLimiter } from "../middlewares/rateLimiter.middleware.js";
import {
  createAnnouncementController,
  createInquiryController,
  getAnnouncementsController,
  getCurriculumController,
  getDashboardController,
  getInquiryController,
  getMyCohortsController,
  getMyInquiriesController,
  getWeekController,
  updateProgressController,
} from "../controllers/lms.controller.js";
import {
  closePollController,
  createPollController,
  endLiveSessionController,
  getChatController,
  getLiveSessionController,
  getPeopleController,
  joinLiveSessionController,
  listLiveSessionsController,
  sendChatController,
  startLiveSessionController,
  toggleHandController,
  updateSharedCodeController,
  votePollController,
} from "../controllers/lmsLive.controller.js";
import {
  getCodeLabController,
  getMySubmissionsController,
  listCodeLabsController,
  submitCodeLabController,
} from "../controllers/lmsCode.controller.js";
import {
  addCohortStudentsController,
  cancelLiveSessionController,
  createCodeLabController,
  createCohortController,
  createLiveSessionController,
  createTrimesterController,
  listAllInquiriesController,
  listCohortsController,
  listTrimestersController,
  removeCohortStudentController,
  updateCodeLabController,
  updateInquiryController,
  upsertWeekController,
} from "../controllers/lmsAdmin.controller.js";

const router = Router();

// Every LMS endpoint needs a signed-in user
router.use(authGuard);

/* ---- Admin: set up trimesters, cohorts, plans, live classes, labs; answer inquiries ---- */
const admin = Router();
admin.use(roleGuard("admin"));
admin.get("/trimesters", listTrimestersController);
admin.post("/trimesters", createTrimesterController);
admin.put("/trimesters/:id/weeks/:weekNumber", upsertWeekController);
admin.get("/cohorts", listCohortsController);
admin.post("/cohorts", createCohortController);
admin.post("/cohorts/:id/students", addCohortStudentsController);
admin.delete("/cohorts/:id/students/:userId", removeCohortStudentController);
admin.post("/live-sessions", createLiveSessionController);
admin.post("/live-sessions/:id/cancel", cancelLiveSessionController);
admin.post("/code-labs", createCodeLabController);
admin.put("/code-labs/:slug", updateCodeLabController);
admin.get("/inquiries", listAllInquiriesController);
admin.put("/inquiries/:id", updateInquiryController);
router.use("/admin", admin);

/* ---- My cohorts, dashboard, weekly path, progress, announcements ---- */
router.get("/me", getMyCohortsController);
router.get("/dashboard", resolveCohort, getDashboardController);
router.get("/curriculum", resolveCohort, getCurriculumController);
router.get("/curriculum/weeks/:weekNumber", resolveCohort, getWeekController);
router.post("/progress", resolveCohort, updateProgressController);
router.get("/announcements", resolveCohort, getAnnouncementsController);
router.post("/announcements", resolveCohort, requireTeacher, createAnnouncementController);

/* ---- Help Center inquiries ---- */
router.post("/inquiries", inquiryLimiter, createInquiryController);
router.get("/inquiries", getMyInquiriesController);
router.get("/inquiries/:id", getInquiryController);

/* ---- Live classes ---- */
router.get("/live-sessions", resolveCohort, listLiveSessionsController);
const live = Router({ mergeParams: true });
live.use(resolveLiveSession);
live.get("/", getLiveSessionController);
live.post("/join", joinLiveSessionController);
live.post("/start", requireTeacher, startLiveSessionController);
live.post("/end", requireTeacher, endLiveSessionController);
live.get("/chat", getChatController);
live.post("/chat", liveChatLimiter, sendChatController);
live.post("/polls", requireTeacher, createPollController);
live.post("/polls/:pollId/vote", votePollController);
live.post("/polls/:pollId/close", requireTeacher, closePollController);
live.post("/hand", toggleHandController);
live.get("/people", getPeopleController);
live.put("/shared-code", requireTeacher, updateSharedCodeController);
router.use("/live-sessions/:id", live);

/* ---- Coding labs ---- */
router.get("/code-labs", listCodeLabsController);
router.get("/code-labs/:slug", getCodeLabController);
router.post("/code-labs/:slug/submissions", codeSubmissionLimiter, submitCodeLabController);
router.get("/code-labs/:slug/submissions/me", getMySubmissionsController);

export default router;
