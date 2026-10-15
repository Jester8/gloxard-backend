import crypto from "crypto";
import mongoose from "mongoose";
import { Cohort, LmsProgress, LmsWeek, Trimester } from "../models/Lms.model.js";
import { LmsCertificate } from "../models/LmsLearning.model.js";
import { Notification } from "../models/Notification.model.js";
import { emitNotification } from "../socket/socket.handler.js";
import { dayKey, flattenItems } from "./lmsSchedule.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const tzOffsetMs = () => (Number(process.env.LMS_TZ_OFFSET_MINUTES ?? 60) || 0) * 60 * 1000;

export const isId = (value) => mongoose.Types.ObjectId.isValid(value);
export const bad = (res, field, message) => res.status(400).json({ error: message, fields: { [field]: message } });
export const invalid = (res, fields) => res.status(400).json({ error: Object.values(fields).join(", "), fields });

export const paginate = (query, defaultLimit = 20, maxLimit = 50) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || defaultLimit, 1), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
};

export const isTeacher = (req) => req.cohortRole === "admin" || req.cohortRole === "instructor";

/* ---------- People ---------- */
export const fullName = (user) =>
  user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Member" : "Member";

export const initialsOf = (user) => {
  const first = (user?.firstName || "").trim();
  const last = (user?.lastName || "").trim();
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase();
  const single = first || (user?.username || "").trim() || "M";
  return single.slice(0, 2).toUpperCase();
};

export const AUTHOR_FIELDS = "firstName lastName username role";

/** Safe public view of a user: no email, no contact details. */
export const authorView = (user) => ({
  _id: user?._id ?? null,
  name: fullName(user),
  initials: initialsOf(user),
  isInstructor: user?.role === "instructor" || user?.role === "admin",
});

/* ---------- Dates ---------- */
/** Due date = cohort start + (week - 1) * 7 + dayIndex days, at dueTime (HH:MM) in the LMS timezone. */
export const assignmentDueAt = (cohort, assignment) => {
  const offsetDays = (assignment.weekNumber - 1) * 7 + assignment.dueDayIndex;
  const localDay = dayKey(new Date(new Date(cohort.startsAt).getTime() + offsetDays * DAY_MS));
  const [hours, minutes] = String(assignment.dueTime || "23:59").split(":").map(Number);
  return new Date(localDay * DAY_MS - tzOffsetMs() + ((hours || 0) * 60 + (minutes || 0)) * 60 * 1000);
};

const localParts = (date) => {
  const shifted = new Date(new Date(date).getTime() + tzOffsetMs());
  return { month: MONTHS[shifted.getUTCMonth()], day: shifted.getUTCDate(), year: shifted.getUTCFullYear() };
};

export const dueLabel = (dueAt, now = new Date()) => {
  const diff = dayKey(dueAt) - dayKey(now);
  if (diff === 0) return "Due Today";
  if (diff === 1) return "Due Tomorrow";
  const { month, day } = localParts(dueAt);
  return `Due ${month} ${String(day).padStart(2, "0")}`;
};

export const monthYear = (date) => {
  const { month, year } = localParts(date);
  return `${month} ${year}`;
};

/* ---------- Grades ---------- */
const GRADE_SCALE = [
  [97, "A+"], [93, "A"], [90, "A-"], [87, "B+"], [83, "B"], [80, "B-"], [77, "C+"], [73, "C"], [70, "C-"], [60, "D"],
];
export const letterGrade = (percent) => {
  if (percent === null || percent === undefined || Number.isNaN(percent)) return null;
  return (GRADE_SCALE.find(([min]) => percent >= min) || [0, "F"])[1];
};

export const totalPoints = (assignment) => (assignment.rubric || []).reduce((sum, row) => sum + (row.points || 0), 0);

/* ---------- Progress ---------- */
/** Percent complete for every student of a cohort, from one pass over the plan and the progress documents. */
export const cohortProgress = async (cohort, weeks = null) => {
  const trimesterId = cohort.trimester?._id || cohort.trimester;
  const plan = weeks || (await LmsWeek.find({ trimester: trimesterId }).lean());
  const itemIds = new Set(flattenItems(plan, cohort, new Set()).map((item) => String(item._id)));
  const docs = await LmsProgress.find({ cohort: cohort._id }).lean();
  const byUser = new Map();
  const updatedAt = new Map();
  for (const doc of docs) {
    const done = (doc.completedItems || []).filter((id) => itemIds.has(String(id))).length;
    byUser.set(String(doc.user), itemIds.size ? Math.round((done / itemIds.size) * 100) : 0);
    updatedAt.set(String(doc.user), doc.updatedAt);
  }
  return { total: itemIds.size, percentOf: (userId) => byUser.get(String(userId)) ?? 0, updatedAt };
};

/** Percent complete for one student. */
export const userProgressPercent = async (cohort, userId, weeks = null) => {
  const trimesterId = cohort.trimester?._id || cohort.trimester;
  const plan = weeks || (await LmsWeek.find({ trimester: trimesterId }).lean());
  const itemIds = new Set(flattenItems(plan, cohort, new Set()).map((item) => String(item._id)));
  if (!itemIds.size) return 0;
  const doc = await LmsProgress.findOne({ user: userId, cohort: cohort._id }).lean();
  const done = (doc?.completedItems || []).filter((id) => itemIds.has(String(id))).length;
  return Math.round((done / itemIds.size) * 100);
};

/* ---------- Certificates ---------- */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => {
  const bytes = crypto.randomBytes(6);
  return `GLX-${Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("")}`;
};

/** Notifies a user in-app and over the socket. Never throws: a failed notification must not fail the request. */
export const notifyUser = async (recipient, { title, message, link = null, type = "lms" }) => {
  try {
    const notification = await Notification.create({ recipient, title, message, type, link });
    emitNotification(String(recipient), notification.toJSON());
  } catch (error) {
    console.error("LMS notification failed:", error.message);
  }
};

/**
 * Issues the completion certificate for (user, cohort). Idempotent: returns { certificate, created }.
 * `cohort` may be populated or not.
 */
export const issueCertificate = async (userId, cohortOrId, { badge = "Gloxad Certified" } = {}) => {
  const existing = await LmsCertificate.findOne({ user: userId, cohort: cohortOrId._id || cohortOrId });
  if (existing) return { certificate: existing, created: false };

  const cohort = cohortOrId.trimester?.name ? cohortOrId : await Cohort.findById(cohortOrId._id || cohortOrId).populate("trimester");
  const trimester = cohort.trimester?.name ? cohort.trimester : await Trimester.findById(cohort.trimester);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const certificate = await LmsCertificate.create({
        user: userId,
        cohort: cohort._id,
        trimester: trimester._id,
        title: trimester.programName,
        subtitle: `${trimester.name} Core Curriculum`,
        badge,
        completedAt: new Date(),
        code: newCode(),
      });
      await notifyUser(userId, {
        title: "Certificate earned",
        message: `You completed ${trimester.programName}. Your certificate code is ${certificate.code}.`,
        link: "/lms/certificates",
        type: "certificate",
      });
      return { certificate, created: true };
    } catch (error) {
      if (error.code !== 11000) throw error;
      const raced = await LmsCertificate.findOne({ user: userId, cohort: cohort._id });
      if (raced) return { certificate: raced, created: false };
      // otherwise the random code collided: try another
    }
  }
  throw new Error("Could not generate a unique certificate code");
};

/** Issues the certificate when the student's overall progress is 100%. Returns the new certificate or null. */
export const issueIfComplete = async (userId, cohort) => {
  if ((await userProgressPercent(cohort, userId)) < 100) return null;
  const { certificate, created } = await issueCertificate(userId, cohort);
  return created ? certificate : null;
};
