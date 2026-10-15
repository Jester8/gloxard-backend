import mongoose from "mongoose";
import {
  Cohort,
  LiveAttendance,
  LiveMessage,
  LiveSession,
  LmsWeek,
} from "../models/Lms.model.js";
import { Assignment, AssignmentSubmission, LmsCertificate, QuizAttempt } from "../models/LmsLearning.model.js";
import { Enrollment } from "../models/Enrollment.model.js";
import { Transaction } from "../models/Transaction.model.js";
import { User } from "../models/User.model.js";
import { cohortProgress, fullName, initialsOf, letterGrade, paginate, totalPoints } from "../utils/lmsLearning.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERDUE_AFTER_MS = 3 * DAY_MS; // a submission waiting this long for a grade counts as overdue

const latest = (map, userId, date) => {
  if (!date) return;
  const key = String(userId);
  const time = new Date(date).getTime();
  if (!map.has(key) || map.get(key) < time) map.set(key, time);
};

/**
 * GET /api/lms/instructor/overview?cohortId=&page=&limit=&search=
 * The instructor dashboard: completion, activity, grading queue, next live class and a roster page.
 */
export const instructorOverviewController = async (req, res, next) => {
  try {
    const { cohort } = req;
    const now = Date.now();
    const since = new Date(now - 7 * DAY_MS);
    const studentIds = cohort.students.map(String);
    const studentSet = new Set(studentIds);
    const trimester = cohort.trimester;

    const sessions = await LiveSession.find({ cohort: cohort._id }).select("status startsAt endsAt endedAt title").lean();
    const sessionIds = sessions.map((session) => session._id);

    const [progress, attendance, messages, submissions, quizAttempts, assignments] = await Promise.all([
      cohortProgress(cohort),
      LiveAttendance.find({ session: { $in: sessionIds } }).select("session user joinedAt").lean(),
      LiveMessage.find({ session: { $in: sessionIds }, system: { $ne: true } }).select("author createdAt").lean(),
      AssignmentSubmission.find({ cohort: cohort._id }).populate("user", "firstName lastName username").lean(),
      QuizAttempt.find({ cohort: cohort._id }).select("user submittedAt").lean(),
      Assignment.find({ trimester: trimester._id }).lean(),
    ]);

    // Last activity per student across progress, live classes, chat, submissions and quizzes
    const lastActive = new Map();
    for (const [userId, date] of progress.updatedAt) latest(lastActive, userId, date);
    for (const row of attendance) latest(lastActive, row.user, row.joinedAt);
    for (const row of messages) latest(lastActive, row.author, row.createdAt);
    for (const row of submissions) latest(lastActive, row.user?._id, row.submittedAt);
    for (const row of quizAttempts) latest(lastActive, row.user, row.submittedAt);
    const activeNow = studentIds.filter((id) => (lastActive.get(id) || 0) >= since.getTime()).length;

    const avgCompletion = studentIds.length
      ? Math.round(studentIds.reduce((sum, id) => sum + progress.percentOf(id), 0) / studentIds.length)
      : 0;

    // Average grade: mean of score / total points over graded submissions
    const pointsBySlug = new Map(assignments.map((assignment) => [String(assignment._id), totalPoints(assignment)]));
    const gradedPercents = submissions
      .filter((row) => row.status === "graded" && row.score !== null && pointsBySlug.get(String(row.assignment)) > 0)
      .map((row) => (row.score / pointsBySlug.get(String(row.assignment))) * 100);
    const avgGradePercent = gradedPercents.length ? Math.round(gradedPercents.reduce((a, b) => a + b, 0) / gradedPercents.length) : null;

    // Grading queue: oldest ungraded submissions first
    const pending = submissions.filter((row) => row.status === "submitted").sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
    const assignmentById = new Map(assignments.map((assignment) => [String(assignment._id), assignment]));
    const grading = pending.slice(0, 10).map((row) => {
      const assignment = assignmentById.get(String(row.assignment));
      return {
        assignmentSlug: assignment?.slug ?? null,
        module: assignment?.module ?? "",
        title: assignment?.title ?? "Assignment",
        submissionId: row._id,
        student: { name: fullName(row.user), initials: initialsOf(row.user) },
        submittedAt: row.submittedAt,
        overdue: now - new Date(row.submittedAt).getTime() > OVERDUE_AFTER_MS,
      };
    });

    const nextLive = sessions
      .filter((session) => ["scheduled", "live"].includes(session.status) && new Date(session.endsAt).getTime() >= now)
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0] || null;

    // Roster: attendance comes from the most recent ended class
    const lastEnded = sessions
      .filter((session) => session.status === "ended")
      .sort((a, b) => new Date(b.endedAt || b.endsAt) - new Date(a.endedAt || a.endsAt))[0] || null;
    const attended = new Set(lastEnded ? attendance.filter((row) => String(row.session) === String(lastEnded._id)).map((row) => String(row.user)) : []);

    const { page, limit, skip } = paginate(req.query, 10, 100);
    const users = await User.find({ _id: { $in: cohort.students } }).select("firstName lastName username email").lean();
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    const rows = users
      .map((user) => ({ user, name: fullName(user) }))
      .filter(({ user, name }) => !search || name.toLowerCase().includes(search) || (user.email || "").toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name));
    const roster = rows.slice(skip, skip + limit).map(({ user, name }) => ({
      userId: user._id,
      name,
      email: user.email,
      initials: initialsOf(user),
      attendance: lastEnded ? (attended.has(String(user._id)) ? "Present" : "Absent") : null,
      progress: progress.percentOf(user._id),
      lastActive: lastActive.has(String(user._id)) ? new Date(lastActive.get(String(user._id))).toISOString() : null,
    }));

    return res.status(200).json({
      cohort: { _id: cohort._id, name: cohort.name },
      trimesterName: `${trimester.name}: ${trimester.programName}`,
      trimester: { _id: trimester._id, name: trimester.name, programName: trimester.programName },
      avgCompletion,
      active: { now: activeNow, total: studentIds.length },
      avgGrade: letterGrade(avgGradePercent),
      avgGradePercent,
      gradingPending: pending.length,
      grading,
      nextLiveSession: nextLive && { _id: nextLive._id, title: nextLive.title, startsAt: nextLive.startsAt, endsAt: nextLive.endsAt, status: nextLive.status },
      attendanceSession: lastEnded && { _id: lastEnded._id, title: lastEnded.title },
      roster,
      pagination: { page, limit, total: rows.length },
    });
  } catch (error) {
    next(error);
  }
};

const monthStartUtc = (date, offset = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));

/** GET /api/lms/admin/overview  (admin) */
export const adminOverviewController = async (req, res, next) => {
  try {
    const now = new Date();
    const thisMonth = monthStartUtc(now);
    const trendStart = monthStartUtc(now, -5);

    const [transactions, enrollmentTotal, recentEnrollments, cohorts, certificates] = await Promise.all([
      Transaction.find({ status: "success" }).select("amount currency").lean(),
      Enrollment.countDocuments({}),
      Enrollment.find({ enrolledAt: { $gte: trendStart } }).select("enrolledAt").lean(),
      Cohort.find({}).populate("trimester", "_id").lean(),
      LmsCertificate.find({}).sort({ completedAt: -1 }).limit(5).populate("user", "firstName lastName username").lean(),
    ]);

    // Revenue per currency (never add naira to dollars); the headline figure is the biggest currency
    const byCurrency = {};
    for (const row of transactions) {
      const currency = row.currency || "NGN";
      byCurrency[currency] = (byCurrency[currency] || 0) + (row.amount || 0);
    }
    const [topCurrency, topTotal] = Object.entries(byCurrency).sort((a, b) => b[1] - a[1])[0] || ["NGN", 0];

    const trend = Array.from({ length: 6 }, () => 0);
    let newThisMonth = 0;
    for (const row of recentEnrollments) {
      const date = new Date(row.enrolledAt);
      const monthsAgo = (now.getUTCFullYear() - date.getUTCFullYear()) * 12 + (now.getUTCMonth() - date.getUTCMonth());
      if (monthsAgo >= 0 && monthsAgo < 6) trend[5 - monthsAgo] += 1;
      if (date >= thisMonth) newThisMonth += 1;
    }

    // Completion: share of (student, cohort) pairs that reached 100%
    const weeksByTrimester = new Map();
    let seats = 0;
    let finished = 0;
    for (const cohort of cohorts) {
      if (!cohort.trimester || !cohort.students.length) continue;
      const key = String(cohort.trimester._id);
      if (!weeksByTrimester.has(key)) weeksByTrimester.set(key, await LmsWeek.find({ trimester: cohort.trimester._id }).lean());
      const progress = await cohortProgress(cohort, weeksByTrimester.get(key));
      if (!progress.total) {
        seats += cohort.students.length;
        continue;
      }
      for (const studentId of cohort.students) {
        seats += 1;
        if (progress.percentOf(studentId) >= 100) finished += 1;
      }
    }

    return res.status(200).json({
      revenue: { total: topTotal, currency: topCurrency, byCurrency },
      enrollments: { total: enrollmentTotal, newThisMonth },
      completionRate: seats ? Math.round((finished / seats) * 100) : null,
      // Measured values only: there is no uptime history to compute a percentage from
      platformHealth: {
        status: mongoose.connection.readyState === 1 ? "ok" : "degraded",
        database: ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection.readyState] ?? "unknown",
        processUptimeSeconds: Math.round(process.uptime()),
      },
      enrollmentTrend: trend,
      enrollmentTrendStart: trendStart.toISOString().slice(0, 7),
      recentCertificates: certificates.map((certificate) => ({
        title: certificate.title,
        who: fullName(certificate.user),
        issuedAt: certificate.completedAt,
      })),
    });
  } catch (error) {
    next(error);
  }
};
