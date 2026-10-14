import mongoose from "mongoose";
import { CodeLab, Cohort, Inquiry, LiveSession, LmsWeek, Trimester } from "../models/Lms.model.js";
import { User } from "../models/User.model.js";

const isId = (value) => mongoose.Types.ObjectId.isValid(value);
const bad = (res, field, message) => res.status(400).json({ error: message, fields: { [field]: message } });
const asDate = (value) => (value ? new Date(value) : null);
const validDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

/* ---------- Trimesters ---------- */

/** POST /api/lms/admin/trimesters */
export const createTrimesterController = async (req, res, next) => {
  try {
    const { name, programName, startsAt, endsAt, enrollmentOpensAt, enrollmentClosesAt, price, currency, status } = req.body || {};
    const start = asDate(startsAt);
    const end = asDate(endsAt);
    if (!validDate(start)) return bad(res, "startsAt", "A valid start date is required");
    if (!validDate(end) || end <= start) return bad(res, "endsAt", "End date must be after the start date");

    const trimester = await Trimester.create({
      name, programName, startsAt: start, endsAt: end,
      enrollmentOpensAt: asDate(enrollmentOpensAt), enrollmentClosesAt: asDate(enrollmentClosesAt),
      price, currency, status,
    });
    return res.status(201).json({ message: "Trimester created", trimester });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/admin/trimesters */
export const listTrimestersController = async (req, res, next) => {
  try {
    return res.status(200).json({ trimesters: await Trimester.find().sort({ startsAt: -1 }) });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/lms/admin/trimesters/:id/weeks/:weekNumber
 * Creates or replaces one week of the plan: { objective: { title, text }, estimatedHours, concepts, days: [{ dayIndex, module, title, items: [{ kind, label, labSlug? }] }] }
 * Item ids are kept for items that already exist (matched by kind + label) so students' progress survives edits.
 */
export const upsertWeekController = async (req, res, next) => {
  try {
    const weekNumber = parseInt(req.params.weekNumber, 10);
    if (!isId(req.params.id)) return bad(res, "id", "Invalid trimester ID format");
    if (!Number.isInteger(weekNumber) || weekNumber < 1) return bad(res, "weekNumber", "Invalid week number");
    if (!(await Trimester.exists({ _id: req.params.id }))) return res.status(404).json({ error: "Trimester not found" });

    const { objective, estimatedHours, concepts, days } = req.body || {};
    if (!objective?.title) return bad(res, "objective.title", "An objective title is required");
    if (!Array.isArray(days)) return bad(res, "days", "days must be a list");

    const existing = await LmsWeek.findOne({ trimester: req.params.id, weekNumber });
    const existingItems = new Map();
    existing?.days.forEach((day) => day.items.forEach((item) => existingItems.set(`${day.dayIndex}|${item.kind}|${item.label}`, item._id)));

    const normalisedDays = days.map((day) => ({
      dayIndex: day.dayIndex,
      module: day.module,
      title: day.title,
      items: (day.items || []).map((item) => ({
        ...(existingItems.get(`${day.dayIndex}|${item.kind}|${item.label}`) ? { _id: existingItems.get(`${day.dayIndex}|${item.kind}|${item.label}`) } : {}),
        kind: item.kind,
        label: item.label,
        labSlug: item.labSlug || null,
        lessonRef: item.lessonRef || null,
      })),
    }));

    const week = await LmsWeek.findOneAndUpdate(
      { trimester: req.params.id, weekNumber },
      { $set: { objective, estimatedHours, concepts, days: normalisedDays } },
      { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
    );
    return res.status(existing ? 200 : 201).json({ message: existing ? "Week updated" : "Week created", week });
  } catch (error) {
    next(error);
  }
};

/* ---------- Cohorts ---------- */

/** POST /api/lms/admin/cohorts  { name, trimesterId, instructorId?, startsAt, studentIds? } */
export const createCohortController = async (req, res, next) => {
  try {
    const { name, trimesterId, instructorId, startsAt, studentIds = [] } = req.body || {};
    if (!isId(trimesterId) || !(await Trimester.exists({ _id: trimesterId }))) return bad(res, "trimesterId", "Choose an existing trimester");
    if (instructorId && !isId(instructorId)) return bad(res, "instructorId", "Invalid instructor ID format");
    const start = asDate(startsAt);
    if (!validDate(start)) return bad(res, "startsAt", "A valid start date is required (the Monday of week 1)");
    if (!Array.isArray(studentIds) || studentIds.some((id) => !isId(id))) return bad(res, "studentIds", "studentIds must be a list of valid user IDs");

    const cohort = await Cohort.create({ name, trimester: trimesterId, instructor: instructorId || null, startsAt: start, students: [...new Set(studentIds)] });
    return res.status(201).json({ message: "Cohort created", cohort });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/admin/cohorts */
export const listCohortsController = async (req, res, next) => {
  try {
    const cohorts = await Cohort.find().sort({ startsAt: -1 }).populate("trimester", "name programName").populate("instructor", "firstName lastName email");
    return res.status(200).json({ cohorts: cohorts.map((cohort) => ({ ...cohort.toJSON(), studentCount: cohort.students.length, students: undefined })) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/admin/cohorts/:id/students  { userIds?: [], emails?: [] } */
export const addCohortStudentsController = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, "id", "Invalid cohort ID format");
    const { userIds = [], emails = [] } = req.body || {};
    if (!Array.isArray(userIds) || !Array.isArray(emails) || userIds.some((id) => !isId(id))) {
      return bad(res, "userIds", "userIds must be valid user IDs and emails must be a list");
    }

    const byEmail = emails.length ? await User.find({ email: { $in: emails.map((email) => String(email).trim().toLowerCase()) } }).select("_id email") : [];
    const found = new Set(byEmail.map((user) => user.email));
    const notFound = emails.map((email) => String(email).trim().toLowerCase()).filter((email) => !found.has(email));
    const ids = [...new Set([...userIds, ...byEmail.map((user) => String(user._id))])];

    const cohort = await Cohort.findByIdAndUpdate(req.params.id, { $addToSet: { students: { $each: ids } } }, { returnDocument: "after" });
    if (!cohort) return res.status(404).json({ error: "Cohort not found" });
    return res.status(200).json({ message: `${ids.length} student(s) added`, studentCount: cohort.students.length, emailsNotFound: notFound });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/lms/admin/cohorts/:id/students/:userId */
export const removeCohortStudentController = async (req, res, next) => {
  try {
    if (!isId(req.params.id) || !isId(req.params.userId)) return bad(res, "id", "Invalid ID format");
    const cohort = await Cohort.findByIdAndUpdate(req.params.id, { $pull: { students: req.params.userId } }, { returnDocument: "after" });
    if (!cohort) return res.status(404).json({ error: "Cohort not found" });
    return res.status(200).json({ message: "Student removed", studentCount: cohort.students.length });
  } catch (error) {
    next(error);
  }
};

/* ---------- Live sessions ---------- */

/** POST /api/lms/admin/live-sessions  { cohortId, title, instructorId?, startsAt, endsAt } */
export const createLiveSessionController = async (req, res, next) => {
  try {
    const { cohortId, title, instructorId, startsAt, endsAt } = req.body || {};
    if (!isId(cohortId)) return bad(res, "cohortId", "Choose an existing cohort");
    const cohort = await Cohort.findById(cohortId);
    if (!cohort) return res.status(404).json({ error: "Cohort not found" });

    const start = asDate(startsAt);
    const end = asDate(endsAt);
    if (!validDate(start)) return bad(res, "startsAt", "A valid start time is required");
    if (!validDate(end) || end <= start) return bad(res, "endsAt", "End time must be after the start time");

    const instructor = instructorId || cohort.instructor;
    if (!instructor || !isId(instructor)) return bad(res, "instructorId", "An instructor is required");

    const session = await LiveSession.create({ cohort: cohort._id, title, instructor, startsAt: start, endsAt: end });
    return res.status(201).json({ message: "Live session scheduled", session });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/admin/live-sessions/:id/cancel */
export const cancelLiveSessionController = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, "id", "Invalid session ID format");
    const session = await LiveSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: "Live session not found" });
    if (session.status !== "scheduled") return res.status(409).json({ error: `A ${session.status} class can't be cancelled` });
    session.status = "cancelled";
    await session.save();
    return res.status(200).json({ message: "Live session cancelled", session });
  } catch (error) {
    next(error);
  }
};

/* ---------- Coding labs ---------- */

/** POST /api/lms/admin/code-labs */
export const createCodeLabController = async (req, res, next) => {
  try {
    const { slug, title, module, estimate, steps, hints, files, trimesterId, published } = req.body || {};
    if (trimesterId && !isId(trimesterId)) return bad(res, "trimesterId", "Invalid trimester ID format");
    if (!Array.isArray(files) || files.length === 0) return bad(res, "files", "Add at least one file");
    const lab = await CodeLab.create({ slug, title, module, estimate, steps, hints, files, published, trimester: trimesterId || null });
    return res.status(201).json({ message: "Coding lab created", lab });
  } catch (error) {
    if (error.code === 11000) return bad(res, "slug", "A lab with this slug already exists");
    next(error);
  }
};

/** PUT /api/lms/admin/code-labs/:slug */
export const updateCodeLabController = async (req, res, next) => {
  try {
    const allowed = ["title", "module", "estimate", "steps", "hints", "files", "published"];
    const update = Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => allowed.includes(key)));
    const lab = await CodeLab.findOneAndUpdate({ slug: req.params.slug.toLowerCase() }, { $set: update }, { returnDocument: "after", runValidators: true });
    if (!lab) return res.status(404).json({ error: "Coding lab not found" });
    return res.status(200).json({ message: "Coding lab updated", lab });
  } catch (error) {
    next(error);
  }
};

/* ---------- Inquiries ---------- */

/** GET /api/lms/admin/inquiries?status=&category= */
export const listAllInquiriesController = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};
    if (["pending", "in_progress", "resolved"].includes(req.query.status)) filter.status = req.query.status;
    if (["academics", "technical", "billing"].includes(req.query.category)) filter.category = req.query.category;
    const [inquiries, total] = await Promise.all([
      Inquiry.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("user", "firstName lastName email"),
      Inquiry.countDocuments(filter),
    ]);
    return res.status(200).json({ inquiries, page, limit, total });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/admin/inquiries/:id  { status?, reply? } */
export const updateInquiryController = async (req, res, next) => {
  try {
    if (!isId(req.params.id)) return bad(res, "id", "Invalid inquiry ID format");
    const { status, reply } = req.body || {};
    if (status !== undefined && !["pending", "in_progress", "resolved"].includes(status)) return bad(res, "status", "Invalid status");
    if (reply !== undefined && (typeof reply !== "string" || !reply.trim())) return bad(res, "reply", "Reply cannot be empty");

    const inquiry = await Inquiry.findById(req.params.id);
    if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });
    if (status) inquiry.status = status;
    if (reply) inquiry.replies.push({ author: req.user._id, message: reply.trim() });
    await inquiry.save();
    return res.status(200).json({ message: "Inquiry updated", inquiry });
  } catch (error) {
    next(error);
  }
};
