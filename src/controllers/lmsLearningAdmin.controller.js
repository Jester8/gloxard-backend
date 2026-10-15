import { Trimester } from "../models/Lms.model.js";
import { Assignment, Lesson, LmsQuiz } from "../models/LmsLearning.model.js";
import { parseYouTubeId } from "../utils/youtube.js";
import { invalid, isId } from "../utils/lmsLearning.js";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const has = (body, key) => body[key] !== undefined;
const isText = (value, max) => typeof value === "string" && value.length <= max;

const resolveTrimester = async (req, res, { required }) => {
  const id = req.body?.trimesterId || req.query.trimesterId;
  if (!id) {
    if (required) invalid(res, { trimesterId: "trimesterId is required" });
    return required ? null : undefined;
  }
  if (!isId(id)) {
    invalid(res, { trimesterId: "Invalid trimester ID format" });
    return null;
  }
  if (!(await Trimester.exists({ _id: id }))) {
    res.status(404).json({ error: "Trimester not found" });
    return null;
  }
  return id;
};

const duplicate = (res, error) => {
  if (error.code !== 11000) return false;
  invalid(res, { slug: "That slug is already used in this trimester" });
  return true;
};

const pick = (body, keys) => Object.fromEntries(keys.filter((key) => has(body, key)).map((key) => [key, body[key]]));

/** Shared create/update flow: validates `data`, then creates (POST) or patches by slug (PUT). */
const upsertFlow = (Model, label, validate) => ({
  create: async (req, res, next) => {
    try {
      const trimester = await resolveTrimester(req, res, { required: true });
      if (!trimester) return;
      const body = req.body || {};
      const { fields, data } = validate(body, { partial: false });
      if (!body.slug || !SLUG.test(String(body.slug).toLowerCase())) fields.slug = "slug is required (lowercase letters, numbers and dashes)";
      if (Object.keys(fields).length) return invalid(res, fields);
      const doc = await Model.create({ ...data, slug: String(body.slug).toLowerCase(), trimester });
      return res.status(201).json({ message: `${label} created`, [label.toLowerCase()]: doc });
    } catch (error) {
      if (duplicate(res, error)) return;
      next(error);
    }
  },
  update: async (req, res, next) => {
    try {
      const trimester = await resolveTrimester(req, res, { required: true });
      if (!trimester) return;
      const doc = await Model.findOne({ trimester, slug: String(req.params.slug).toLowerCase() });
      if (!doc) return res.status(404).json({ error: `${label} not found` });
      const { fields, data } = validate(req.body || {}, { partial: true });
      if (Object.keys(fields).length) return invalid(res, fields);
      doc.set(data); // slug and trimester are never changed
      await doc.save();
      return res.status(200).json({ message: `${label} updated`, [label.toLowerCase()]: doc });
    } catch (error) {
      next(error);
    }
  },
});

/* ---------- Lessons ---------- */
const validateLesson = (body, { partial }) => {
  const fields = {};
  const data = pick(body, ["module", "title", "order", "durationMinutes", "intro", "objectives", "concepts", "tip", "outro", "file", "published"]);

  if (!partial && !body.title) fields.title = "A title is required";
  if (has(body, "title") && (!isText(body.title, 200) || !body.title.trim())) fields.title = "A title of up to 200 characters is required";
  if (has(body, "module") && !isText(body.module, 100)) fields.module = "module must be text";
  if (has(body, "order") && !Number.isFinite(body.order)) fields.order = "order must be a number";
  if (has(body, "durationMinutes") && body.durationMinutes !== null && !(Number.isFinite(body.durationMinutes) && body.durationMinutes >= 0)) fields.durationMinutes = "durationMinutes must be a number or null";
  for (const key of ["intro", "tip", "outro"]) if (has(body, key) && !isText(body[key], key === "intro" ? 5000 : 2000)) fields[key] = `${key} is too long`;
  if (has(body, "objectives") && !(Array.isArray(body.objectives) && body.objectives.every((item) => isText(item, 300) && item.trim()))) fields.objectives = "objectives must be a list of short text items";
  if (has(body, "concepts") && !(Array.isArray(body.concepts) && body.concepts.every((item) => item && isText(item.title, 200) && item.title.trim() && (item.text === undefined || isText(item.text, 2000))))) fields.concepts = "concepts must be a list of { title, text }";
  if (has(body, "file") && body.file !== null && !(body.file && isText(body.file.name, 200))) fields.file = "file must be { name, sizeLabel, key } or null";
  if (has(body, "file") && body.file === null) data.file = { name: "", sizeLabel: "", key: "" };
  if (has(body, "published") && typeof body.published !== "boolean") fields.published = "published must be true or false";

  if (has(body, "videoUrl")) {
    if (!body.videoUrl) data.videoId = "";
    else {
      const id = parseYouTubeId(body.videoUrl);
      if (!id) fields.videoUrl = "Paste a YouTube watch, live, embed or youtu.be link";
      else data.videoId = id;
    }
  }
  return { fields, data };
};
const lessons = upsertFlow(Lesson, "Lesson", validateLesson);
export const createLessonController = lessons.create;
export const updateLessonController = lessons.update;

/* ---------- Quizzes ---------- */
const validateQuiz = (body, { partial }) => {
  const fields = {};
  const data = pick(body, ["course", "name", "module", "order", "minutes", "passMark", "questions", "published"]);

  if (!partial && !body.name) fields.name = "A quiz name is required";
  if (has(body, "name") && (!isText(body.name, 200) || !body.name.trim())) fields.name = "A name of up to 200 characters is required";
  for (const key of ["course", "module"]) if (has(body, key) && !isText(body[key], 200)) fields[key] = `${key} must be text`;
  if (has(body, "order") && !Number.isFinite(body.order)) fields.order = "order must be a number";
  if (has(body, "minutes") && !(Number.isInteger(body.minutes) && body.minutes >= 1)) fields.minutes = "minutes must be a whole number of 1 or more";
  if (has(body, "passMark") && !(Number.isFinite(body.passMark) && body.passMark >= 1 && body.passMark <= 100)) fields.passMark = "passMark must be a percent from 1 to 100";
  if (has(body, "published") && typeof body.published !== "boolean") fields.published = "published must be true or false";

  if (!partial && !has(body, "questions")) fields.questions = "Add at least one question";
  if (has(body, "questions")) {
    const questions = body.questions;
    if (!Array.isArray(questions) || questions.length === 0) fields.questions = "Add at least one question";
    else {
      for (const [index, question] of questions.entries()) {
        const where = `questions[${index}]`;
        if (!question || !isText(question.prompt, 1000) || !question.prompt.trim()) { fields[where] = `Question ${index + 1} needs a prompt`; break; }
        if (question.hint !== undefined && !isText(question.hint, 500)) { fields[where] = `Question ${index + 1} has an invalid hint`; break; }
        const options = question.options;
        if (!Array.isArray(options) || options.length < 2 || options.length > 6 || !options.every((option) => isText(option, 500) && option.trim())) {
          fields[where] = `Question ${index + 1} needs 2 to 6 options`;
          break;
        }
        if (!Number.isInteger(question.answer) || question.answer < 0 || question.answer >= options.length) {
          fields[where] = `Question ${index + 1} needs an answer between 0 and ${options.length - 1}`;
          break;
        }
      }
    }
  }
  return { fields, data };
};
const quizzes = upsertFlow(LmsQuiz, "Quiz", validateQuiz);
export const createQuizController = quizzes.create;
export const updateQuizController = quizzes.update;

/* ---------- Assignments ---------- */
const validateAssignment = (body, { partial }) => {
  const fields = {};
  const data = pick(body, ["module", "title", "summary", "description", "badge", "weekNumber", "dueDayIndex", "dueTime", "rubric", "published"]);

  if (!partial && !body.title) fields.title = "A title is required";
  if (has(body, "title") && (!isText(body.title, 200) || !body.title.trim())) fields.title = "A title of up to 200 characters is required";
  for (const [key, max] of [["module", 100], ["summary", 500], ["description", 10000], ["badge", 100]]) if (has(body, key) && !isText(body[key], max)) fields[key] = `${key} must be text of up to ${max} characters`;
  if (!partial && !has(body, "weekNumber")) fields.weekNumber = "weekNumber is required";
  if (has(body, "weekNumber") && !(Number.isInteger(body.weekNumber) && body.weekNumber >= 1)) fields.weekNumber = "weekNumber must be a whole number of 1 or more";
  if (!partial && !has(body, "dueDayIndex")) fields.dueDayIndex = "dueDayIndex is required (0 = Monday)";
  if (has(body, "dueDayIndex") && !(Number.isInteger(body.dueDayIndex) && body.dueDayIndex >= 0 && body.dueDayIndex <= 6)) fields.dueDayIndex = "dueDayIndex must be 0 (Monday) to 6 (Sunday)";
  if (has(body, "dueTime") && !(typeof body.dueTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.dueTime))) fields.dueTime = "dueTime must look like 23:59";
  if (has(body, "published") && typeof body.published !== "boolean") fields.published = "published must be true or false";
  if (!partial && !has(body, "rubric")) fields.rubric = "Add at least one rubric criterion";
  if (has(body, "rubric")) {
    const rubric = body.rubric;
    const valid = Array.isArray(rubric) && rubric.length > 0
      && rubric.every((row) => row && isText(row.criterion, 200) && row.criterion.trim() && Number.isFinite(row.points) && row.points >= 0);
    if (!valid) fields.rubric = "rubric must be a list of { criterion, points } with points of 0 or more";
    else if (new Set(rubric.map((row) => row.criterion)).size !== rubric.length) fields.rubric = "Each rubric criterion must be unique";
    else if (rubric.reduce((sum, row) => sum + row.points, 0) <= 0) fields.rubric = "The rubric must be worth more than 0 points";
  }
  return { fields, data };
};
const assignments = upsertFlow(Assignment, "Assignment", validateAssignment);
export const createAssignmentController = assignments.create;
export const updateAssignmentController = assignments.update;
