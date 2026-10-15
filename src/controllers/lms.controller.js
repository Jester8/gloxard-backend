import crypto from "crypto";
import mongoose from "mongoose";
import {
  Cohort,
  INQUIRY_CATEGORIES,
  Inquiry,
  LiveAttendance,
  LiveSession,
  LmsAnnouncement,
  LmsProgress,
  LmsWeek,
} from "../models/Lms.model.js";
import {
  currentWeekNumber,
  dayKey,
  decorateWeek,
  flattenItems,
  isItemUnlocked,
} from "../utils/lmsSchedule.js";
import { issueIfComplete } from "../utils/lmsLearning.js";
import { assignmentSummariesFor } from "./lmsAssignments.controller.js";

const ASSIGNMENT_KINDS = ["problems", "submission"];
const ALLOWED_ATTACHMENT_TYPES = ["image/svg+xml", "image/png", "image/jpeg", "application/pdf"];
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const paginate = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const cohortSummary = (cohort, role) => ({
  _id: cohort._id,
  name: cohort.name,
  role,
  startsAt: cohort.startsAt,
  status: cohort.status,
  trimester: cohort.trimester && {
    _id: cohort.trimester._id,
    name: cohort.trimester.name,
    programName: cohort.trimester.programName,
    startsAt: cohort.trimester.startsAt,
    endsAt: cohort.trimester.endsAt,
  },
});

const getProgressSet = async (userId, cohortId) => {
  const progress = await LmsProgress.findOne({ user: userId, cohort: cohortId }).lean();
  return new Set((progress?.completedItems || []).map(String));
};

/**
 * GET /api/lms/me
 * The cohorts the signed-in user belongs to (students, instructors and admins).
 */
export const getMyCohortsController = async (req, res, next) => {
  try {
    const filter =
      req.user.role === "admin"
        ? { status: "active" }
        : { $or: [{ students: req.user._id }, { instructor: req.user._id }], status: "active" };
    const cohorts = await Cohort.find(filter).sort({ startsAt: -1 }).populate("trimester");

    const rows = cohorts.map((cohort) => {
      const isInstructor = cohort.instructor && cohort.instructor.toString() === req.user._id.toString();
      const role = req.user.role === "admin" ? "admin" : isInstructor ? "instructor" : "student";
      return cohortSummary(cohort, role);
    });

    return res.status(200).json({ cohorts: rows, activeCohortId: rows[0]?._id ?? null });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/dashboard?cohortId=
 * Progress overview, "up next", upcoming activities and announcements for the student dashboard.
 */
export const getDashboardController = async (req, res, next) => {
  try {
    const { cohort } = req;
    const now = new Date();

    const weeks = await LmsWeek.find({ trimester: cohort.trimester._id }).sort({ weekNumber: 1 }).lean();
    const doneSet = await getProgressSet(req.user._id, cohort._id);
    const items = flattenItems(weeks, cohort, doneSet);

    const total = items.length;
    const done = items.filter((item) => item.done).length;
    const weekNumber = currentWeekNumber(cohort, weeks.length, now);
    const weekItems = items.filter((item) => item.weekNumber === weekNumber);
    const weekDone = weekItems.filter((item) => item.done).length;
    // Real assignments (with submissions) drive the assignment numbers; plans without any fall back to the problem/submission items
    const assignmentRows = await assignmentSummariesFor(cohort, req.user._id, { now });
    const assignmentItems = items.filter((item) => ASSIGNMENT_KINDS.includes(item.kind));

    const endedSessions = await LiveSession.find({ cohort: cohort._id, status: "ended" }).select("_id");
    const [attended, nextSessions, announcements] = await Promise.all([
      LiveAttendance.countDocuments({ user: req.user._id, session: { $in: endedSessions.map((entry) => entry._id) } }),
      LiveSession.find({ cohort: cohort._id, status: { $in: ["scheduled", "live"] }, endsAt: { $gte: now } })
        .sort({ startsAt: 1 })
        .limit(3)
        .select("title startsAt endsAt status"),
      LmsAnnouncement.find({ cohort: cohort._id }).sort({ createdAt: -1 }).limit(5).populate("author", "firstName lastName role"),
    ]);

    const upNextItem = items.find((item) => !item.done && isItemUnlocked(item.date, now)) || null;

    // Upcoming = unfinished items from today on, mixed with scheduled live classes, soonest first (4 entries).
    // Assignments are due late in the day, so the next ones due within a week are always added on top.
    const todayKey = dayKey(now);
    const base = [
      ...items
        .filter((item) => !item.done && dayKey(item.date) >= todayKey)
        .slice(0, 6)
        .map((item) => ({ type: item.kind, title: item.label, detail: item.title, dueAt: item.date, itemId: item._id, labSlug: item.labSlug, lessonRef: item.lessonRef })),
      ...nextSessions.map((session) => ({ type: "live", title: session.title, detail: "Live class", dueAt: session.startsAt, sessionId: session._id })),
    ]
      .sort((a, b) => a.dueAt - b.dueAt)
      .slice(0, 4);
    const dueAssignments = assignmentRows
      .filter((row) => row.status === "not_started" && row.dueAt >= now && row.dueAt - now < 7 * 24 * 60 * 60 * 1000)
      .slice(0, 3)
      .map((row) => ({ type: "assignment", title: row.title, detail: row.module, dueAt: row.dueAt, dueLabel: row.dueLabel, assignmentSlug: row.slug }));
    const upcoming = [...base, ...dueAssignments].sort((a, b) => a.dueAt - b.dueAt);

    return res.status(200).json({
      cohort: cohortSummary(cohort, req.cohortRole),
      currentWeek: weekNumber,
      progress: {
        overall: total ? Math.round((done / total) * 100) : 0,
        week: { weekNumber, percent: weekItems.length ? Math.round((weekDone / weekItems.length) * 100) : 0 },
        assignments: assignmentRows.length
          ? { done: assignmentRows.filter((row) => row.status !== "not_started").length, total: assignmentRows.length }
          : { done: assignmentItems.filter((item) => item.done).length, total: assignmentItems.length },
        attendance: {
          attended,
          total: endedSessions.length,
          percent: endedSessions.length ? Math.round((attended / endedSessions.length) * 100) : null,
        },
      },
      upNext: upNextItem && {
        itemId: upNextItem._id,
        kind: upNextItem.kind,
        label: upNextItem.label,
        title: upNextItem.title,
        module: upNextItem.module,
        weekNumber: upNextItem.weekNumber,
        day: upNextItem.day,
        labSlug: upNextItem.labSlug,
        lessonRef: upNextItem.lessonRef,
      },
      upcoming,
      nextLiveSession: nextSessions[0] || null,
      announcements,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/curriculum?cohortId=
 * Week overview (progress per week) and which week is current.
 */
export const getCurriculumController = async (req, res, next) => {
  try {
    const { cohort } = req;
    const weeks = await LmsWeek.find({ trimester: cohort.trimester._id }).sort({ weekNumber: 1 }).lean();
    const doneSet = await getProgressSet(req.user._id, cohort._id);

    return res.status(200).json({
      cohort: cohortSummary(cohort, req.cohortRole),
      currentWeek: currentWeekNumber(cohort, weeks.length),
      weeks: weeks.map((week) => {
        const { weekNumber, objective, progress, estimatedHours } = decorateWeek(week, cohort, doneSet);
        return { weekNumber, title: objective.title, progress, estimatedHours };
      }),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/lms/curriculum/weeks/:weekNumber?cohortId=
 * The Weekly Learning Path screen: objective, key concepts and the Mon-Sun daily schedule.
 */
export const getWeekController = async (req, res, next) => {
  try {
    const weekNumber = parseInt(req.params.weekNumber, 10);
    if (!Number.isInteger(weekNumber) || weekNumber < 1) {
      return res.status(400).json({ error: "Invalid week number" });
    }

    const { cohort } = req;
    const week = await LmsWeek.findOne({ trimester: cohort.trimester._id, weekNumber }).lean();
    if (!week) return res.status(404).json({ error: "Week not found" });

    const doneSet = await getProgressSet(req.user._id, cohort._id);
    return res.status(200).json({
      cohort: cohortSummary(cohort, req.cohortRole),
      trimester: cohort.trimester.name,
      programName: cohort.trimester.programName,
      week: decorateWeek(week, cohort, doneSet),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/progress  { itemId, completed }
 * Marks a scheduled item done (or undone). Items on days that haven't started yet cannot be completed.
 */
export const updateProgressController = async (req, res, next) => {
  try {
    const { itemId } = req.body || {};
    const completed = req.body?.completed !== false;

    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: "A valid itemId is required" });
    }
    if (req.cohortRole !== "student") {
      return res.status(403).json({ error: "Only students track progress" });
    }

    const { cohort } = req;
    const weeks = await LmsWeek.find({ trimester: cohort.trimester._id }).lean();
    const item = flattenItems(weeks, cohort, new Set()).find((entry) => String(entry._id) === String(itemId));
    if (!item) return res.status(404).json({ error: "Item not found in this trimester" });
    if (!isItemUnlocked(item.date)) {
      return res.status(403).json({ error: "This item isn't unlocked yet" });
    }

    const update = completed
      ? { $addToSet: { completedItems: item._id } }
      : { $pull: { completedItems: item._id } };
    await LmsProgress.findOneAndUpdate({ user: req.user._id, cohort: cohort._id }, update, { upsert: true });

    const doneSet = await getProgressSet(req.user._id, cohort._id);
    const week = weeks.find((entry) => entry.weekNumber === item.weekNumber);
    const decorated = decorateWeek(week, cohort, doneSet);
    const certificate = completed ? await issueIfComplete(req.user._id, cohort) : null;

    return res.status(200).json({
      message: completed ? "Marked as complete" : "Marked as incomplete",
      itemId: item._id,
      completed,
      weekProgress: decorated.progress,
      day: decorated.days[item.dayIndex],
      certificateCode: certificate?.code ?? null,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/announcements?cohortId= */
export const getAnnouncementsController = async (req, res, next) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const filter = { cohort: req.cohort._id };
    const [announcements, total] = await Promise.all([
      LmsAnnouncement.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("author", "firstName lastName role"),
      LmsAnnouncement.countDocuments(filter),
    ]);
    return res.status(200).json({ announcements, page, limit, total });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/announcements  { title, text } (instructor or admin) */
export const createAnnouncementController = async (req, res, next) => {
  try {
    const { title, text } = req.body || {};
    const fields = {};
    if (!title || !String(title).trim()) fields.title = "Title is required";
    if (!text || !String(text).trim()) fields.text = "Message is required";
    if (Object.keys(fields).length) {
      return res.status(400).json({ error: Object.values(fields).join(", "), fields });
    }
    const announcement = await LmsAnnouncement.create({ cohort: req.cohort._id, author: req.user._id, title, text });
    await announcement.populate("author", "firstName lastName role");
    return res.status(201).json({ message: "Announcement posted", announcement });
  } catch (error) {
    next(error);
  }
};

/* ---------- Help Center inquiries ---------- */

const newReference = () => `INQ-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

/**
 * POST /api/lms/inquiries  { category, subject, description, attachments?: [{ key, name, size, mimeType }] }
 * Attachment keys come from POST /api/upload/presigned-url with folder "documents".
 */
export const createInquiryController = async (req, res, next) => {
  try {
    const { category, subject, description, attachments = [], cohortId } = req.body || {};
    const fields = {};

    if (!INQUIRY_CATEGORIES.includes(category)) fields.category = `Category must be one of: ${INQUIRY_CATEGORIES.join(", ")}`;
    if (!subject || String(subject).trim().length < 3) fields.subject = "Enter a short summary of your issue.";
    if (!description || String(description).trim().length < 10) fields.description = "Please describe the issue in a little more detail.";
    if (!Array.isArray(attachments)) fields.attachments = "Attachments must be a list";
    else if (attachments.length > MAX_ATTACHMENTS) fields.attachments = `You can attach up to ${MAX_ATTACHMENTS} files.`;

    const cleanAttachments = [];
    if (!fields.attachments) {
      for (const attachment of attachments) {
        const segments = String(attachment?.key || "").split("/");
        const ownsKey = segments[0] === "documents" && segments[1] === req.user._id.toString() && !String(attachment.key).includes("..");
        if (!ownsKey) {
          fields.attachments = "Attachments must be files you uploaded to the documents folder.";
          break;
        }
        if (attachment.mimeType && !ALLOWED_ATTACHMENT_TYPES.includes(attachment.mimeType)) {
          fields.attachments = "Only SVG, PNG, JPG or PDF files are allowed.";
          break;
        }
        if (Number(attachment.size) > MAX_ATTACHMENT_BYTES) {
          fields.attachments = "Each file must be 10MB or smaller.";
          break;
        }
        cleanAttachments.push({
          key: attachment.key,
          name: String(attachment.name || segments[segments.length - 1]).slice(0, 200),
          size: Number(attachment.size) || 0,
          mimeType: attachment.mimeType || "",
        });
      }
    }

    if (Object.keys(fields).length) {
      return res.status(400).json({ error: Object.values(fields).join(" "), fields });
    }

    let cohort = null;
    if (cohortId && mongoose.Types.ObjectId.isValid(cohortId)) {
      const found = await Cohort.findById(cohortId).select("students instructor");
      const isMember = found && (found.students.some((id) => id.equals(req.user._id)) || found.instructor?.equals(req.user._id));
      if (isMember || (found && req.user.role === "admin")) cohort = found._id;
    }

    const inquiry = await Inquiry.create({
      reference: newReference(),
      user: req.user._id,
      cohort,
      category,
      subject,
      description,
      attachments: cleanAttachments,
    });

    return res.status(201).json({ message: "Inquiry submitted", inquiry });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/inquiries?status=&page=  (your own inquiries, newest first) */
export const getMyInquiriesController = async (req, res, next) => {
  try {
    const { page, limit, skip } = paginate(req.query);
    const filter = { user: req.user._id };
    if (["pending", "in_progress", "resolved"].includes(req.query.status)) filter.status = req.query.status;

    const [inquiries, total] = await Promise.all([
      Inquiry.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).select("-replies -description"),
      Inquiry.countDocuments(filter),
    ]);
    return res.status(200).json({ inquiries, page, limit, total });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/inquiries/:id */
export const getInquiryController = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Invalid inquiry ID format" });
    const inquiry = await Inquiry.findById(req.params.id).populate("replies.author", "firstName lastName role");
    if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });
    if (inquiry.user.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ error: "You do not have access to this inquiry" });
    }
    return res.status(200).json({ inquiry });
  } catch (error) {
    next(error);
  }
};
