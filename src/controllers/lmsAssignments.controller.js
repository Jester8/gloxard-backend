import { Assignment, AssignmentSubmission } from "../models/LmsLearning.model.js";
import {
  AUTHOR_FIELDS,
  assignmentDueAt,
  bad,
  dueLabel,
  fullName,
  initialsOf,
  invalid,
  isId,
  isTeacher,
  notifyUser,
  paginate,
  totalPoints,
} from "../utils/lmsLearning.js";

const ALLOWED_ATTACHMENT_TYPES = [
  "image/svg+xml", "image/png", "image/jpeg", "application/pdf", "application/zip",
  "application/x-zip-compressed", "text/plain", "text/markdown", "application/json",
];
const MAX_ATTACHMENTS = 5;
const MAX_LINKS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_TEXT = 20000;
const MAX_FEEDBACK = 5000;
const PROGRESS = { not_started: 0, submitted: 90, graded: 100 };

const submissionView = (submission) =>
  submission && {
    _id: submission._id,
    text: submission.text,
    links: submission.links,
    attachments: submission.attachments,
    status: submission.status,
    score: submission.score,
    feedback: submission.feedback,
    rubricScores: submission.rubricScores,
    gradedAt: submission.gradedAt,
    submittedAt: submission.submittedAt,
    late: submission.late,
  };

const summary = (assignment, cohort, submission, now = new Date()) => {
  const dueAt = assignmentDueAt(cohort, assignment);
  const status = submission ? submission.status : "not_started";
  return {
    _id: assignment._id,
    slug: assignment.slug,
    module: assignment.module,
    title: assignment.title,
    summary: assignment.summary,
    badge: assignment.badge,
    weekNumber: assignment.weekNumber,
    dueAt,
    dueLabel: dueLabel(dueAt, now),
    urgent: status === "not_started" && dueAt > now && dueAt - now < 48 * 60 * 60 * 1000,
    past: dueAt <= now,
    status,
    progress: PROGRESS[status],
    totalPoints: totalPoints(assignment),
    myScore: submission?.status === "graded" ? submission.score : null,
    late: submission?.late ?? false,
  };
};

/** Every assignment of the cohort's trimester, as the signed-in student sees it. Also used by the dashboard. */
export const assignmentSummariesFor = async (cohort, userId, { includeUnpublished = false, now = new Date() } = {}) => {
  const assignments = await Assignment.find({ trimester: cohort.trimester._id, ...(includeUnpublished ? {} : { published: true }) }).lean();
  const submissions = await AssignmentSubmission.find({ cohort: cohort._id, user: userId, assignment: { $in: assignments.map((row) => row._id) } }).lean();
  const byAssignment = new Map(submissions.map((row) => [String(row.assignment), row]));
  return assignments
    .map((assignment) => summary(assignment, cohort, byAssignment.get(String(assignment._id)), now))
    .sort((a, b) => a.dueAt - b.dueAt);
};

const findAssignment = async (req, res) => {
  const assignment = await Assignment.findOne({
    trimester: req.cohort.trimester._id,
    slug: String(req.params.slug).toLowerCase(),
    ...(req.cohortRole === "student" ? { published: true } : {}),
  });
  if (!assignment) {
    res.status(404).json({ error: "Assignment not found" });
    return null;
  }
  return assignment;
};

/** GET /api/lms/assignments */
export const listAssignmentsController = async (req, res, next) => {
  try {
    const includeUnpublished = isTeacher(req);
    const rows = await assignmentSummariesFor(req.cohort, req.user._id, { includeUnpublished });
    if (!isTeacher(req)) return res.status(200).json({ assignments: rows });

    // Teachers see how many students have handed in each assignment instead of their own (empty) status
    const submissions = await AssignmentSubmission.find({ cohort: req.cohort._id }).select("assignment status").lean();
    const counts = new Map();
    for (const row of submissions) {
      const entry = counts.get(String(row.assignment)) || { submitted: 0, graded: 0 };
      entry[row.status === "graded" ? "graded" : "submitted"] += 1;
      counts.set(String(row.assignment), entry);
    }
    const totalStudents = req.cohort.students.length;
    return res.status(200).json({
      assignments: rows.map((row) => {
        const entry = counts.get(String(row._id)) || { submitted: 0, graded: 0 };
        return { ...row, status: null, progress: null, submissions: { ...entry, total: entry.submitted + entry.graded, students: totalStudents } };
      }),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/assignments/:slug */
export const getAssignmentController = async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, res);
    if (!assignment) return;
    const submission = isTeacher(req)
      ? null
      : await AssignmentSubmission.findOne({ user: req.user._id, cohort: req.cohort._id, assignment: assignment._id });
    return res.status(200).json({
      assignment: {
        ...summary(assignment, req.cohort, submission),
        description: assignment.description,
        dueTime: assignment.dueTime,
        rubric: assignment.rubric,
        published: assignment.published,
      },
      submission: submissionView(submission),
    });
  } catch (error) {
    next(error);
  }
};

const validateSubmission = (body, userId) => {
  const fields = {};
  const { text = "", links = [], attachments = [] } = body || {};

  if (typeof text !== "string") fields.text = "text must be a string";
  else if (text.length > MAX_TEXT) fields.text = `Your answer can be up to ${MAX_TEXT} characters`;

  const cleanLinks = [];
  if (!Array.isArray(links)) fields.links = "links must be a list";
  else if (links.length > MAX_LINKS) fields.links = `You can add up to ${MAX_LINKS} links`;
  else {
    for (const link of links) {
      let url = null;
      try { url = new URL(String(link).trim()); } catch { /* handled below */ }
      if (!url || !["http:", "https:"].includes(url.protocol) || String(link).length > 500) {
        fields.links = "Each link must be a valid http(s) URL";
        break;
      }
      cleanLinks.push(url.toString());
    }
  }

  const cleanAttachments = [];
  if (!Array.isArray(attachments)) fields.attachments = "attachments must be a list";
  else if (attachments.length > MAX_ATTACHMENTS) fields.attachments = `You can attach up to ${MAX_ATTACHMENTS} files.`;
  else {
    for (const attachment of attachments) {
      const segments = String(attachment?.key || "").split("/");
      const ownsKey = segments[0] === "documents" && segments[1] === String(userId) && segments.length >= 3 && !String(attachment.key).includes("..");
      if (!ownsKey) {
        fields.attachments = "Attachments must be files you uploaded to the documents folder.";
        break;
      }
      if (attachment.mimeType && !ALLOWED_ATTACHMENT_TYPES.includes(attachment.mimeType)) {
        fields.attachments = "Only images, PDF, ZIP, text or JSON files are allowed.";
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

  const cleanText = typeof text === "string" ? text.trim() : "";
  if (!Object.keys(fields).length && !cleanText && !cleanLinks.length && !cleanAttachments.length) {
    fields.text = "Add your answer, a link or a file before submitting";
  }
  return { fields, value: { text: cleanText, links: cleanLinks, attachments: cleanAttachments } };
};

/** POST /api/lms/assignments/:slug/submit  { text?, links?, attachments? } (students; resubmit until graded) */
export const submitAssignmentController = async (req, res, next) => {
  try {
    if (req.cohortRole !== "student") return res.status(403).json({ error: "Only students submit assignments" });
    const assignment = await findAssignment(req, res);
    if (!assignment) return;

    const { fields, value } = validateSubmission(req.body, req.user._id);
    if (Object.keys(fields).length) return invalid(res, fields);

    const existing = await AssignmentSubmission.findOne({ user: req.user._id, cohort: req.cohort._id, assignment: assignment._id });
    if (existing?.status === "graded") return res.status(409).json({ error: "This assignment has already been graded and can't be resubmitted" });

    const now = new Date();
    const late = now > assignmentDueAt(req.cohort, assignment);
    const submission = await AssignmentSubmission.findOneAndUpdate(
      { user: req.user._id, cohort: req.cohort._id, assignment: assignment._id },
      { $set: { ...value, status: "submitted", submittedAt: now, late }, $setOnInsert: { score: null, feedback: "", rubricScores: [] } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    return res.status(existing ? 200 : 201).json({
      message: existing ? "Submission updated" : "Submission received",
      resubmitted: Boolean(existing),
      submission: submissionView(submission),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/assignments/:slug/submissions?page=&limit=  (teachers) */
export const listSubmissionsController = async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, res);
    if (!assignment) return;
    const { page, limit, skip } = paginate(req.query, 50, 100);
    const filter = { cohort: req.cohort._id, assignment: assignment._id };
    if (["submitted", "graded"].includes(req.query.status)) filter.status = req.query.status;

    const [rows, total] = await Promise.all([
      AssignmentSubmission.find(filter).sort({ submittedAt: 1 }).skip(skip).limit(limit).populate("user", `${AUTHOR_FIELDS} email`),
      AssignmentSubmission.countDocuments(filter),
    ]);
    return res.status(200).json({
      assignment: { _id: assignment._id, slug: assignment.slug, title: assignment.title, totalPoints: totalPoints(assignment) },
      submissions: rows.map((row) => ({
        ...submissionView(row),
        student: { _id: row.user?._id, name: fullName(row.user), email: row.user?.email, initials: initialsOf(row.user) },
      })),
      totalStudents: req.cohort.students.length,
      page,
      limit,
      total,
    });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/assignments/:slug/submissions/:id/grade  { score?, feedback?, rubricScores? } (teachers) */
export const gradeSubmissionController = async (req, res, next) => {
  try {
    const assignment = await findAssignment(req, res);
    if (!assignment) return;
    if (!isId(req.params.id)) return bad(res, "id", "Invalid submission ID format");
    const submission = await AssignmentSubmission.findOne({ _id: req.params.id, cohort: req.cohort._id, assignment: assignment._id });
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    const { score, feedback = "", rubricScores } = req.body || {};
    const maxPoints = totalPoints(assignment);
    const fields = {};

    let cleanRubric = [];
    if (rubricScores !== undefined) {
      if (!Array.isArray(rubricScores)) fields.rubricScores = "rubricScores must be a list";
      else {
        const seen = new Set();
        for (const row of rubricScores) {
          const criterion = assignment.rubric.find((entry) => entry.criterion === row?.criterion);
          if (!criterion) { fields.rubricScores = `Unknown criterion: ${row?.criterion}`; break; }
          if (seen.has(row.criterion)) { fields.rubricScores = `Criterion scored twice: ${row.criterion}`; break; }
          if (typeof row.points !== "number" || !Number.isFinite(row.points) || row.points < 0 || row.points > criterion.points) {
            fields.rubricScores = `Points for "${row.criterion}" must be between 0 and ${criterion.points}`;
            break;
          }
          seen.add(row.criterion);
          cleanRubric.push({ criterion: row.criterion, points: row.points });
        }
      }
    }

    let finalScore = score;
    if (score === undefined && cleanRubric.length && !fields.rubricScores) finalScore = cleanRubric.reduce((sum, row) => sum + row.points, 0);
    if (finalScore === undefined) fields.score = "A score is required";
    else if (typeof finalScore !== "number" || !Number.isFinite(finalScore) || finalScore < 0) fields.score = "Score must be a number of 0 or more";
    else if (finalScore > maxPoints) fields.score = `Score can't be more than ${maxPoints}`;

    if (typeof feedback !== "string" || feedback.length > MAX_FEEDBACK) fields.feedback = `Feedback can be up to ${MAX_FEEDBACK} characters`;
    if (Object.keys(fields).length) return invalid(res, fields);

    submission.set({
      status: "graded",
      score: finalScore,
      feedback: feedback.trim(),
      rubricScores: cleanRubric,
      gradedBy: req.user._id,
      gradedAt: new Date(),
    });
    await submission.save();

    await notifyUser(submission.user, {
      title: "Assignment graded",
      message: `${assignment.title}: you scored ${finalScore}/${maxPoints}.`,
      link: `/lms/assignments/${assignment.slug}`,
      type: "assignment_graded",
    });

    return res.status(200).json({ message: "Submission graded", submission: submissionView(submission) });
  } catch (error) {
    next(error);
  }
};

