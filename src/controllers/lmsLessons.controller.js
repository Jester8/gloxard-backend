import {
  Lesson,
  LessonComment,
  LessonProgress,
  LmsQuiz,
} from "../models/LmsLearning.model.js";
import { streamDetails } from "../utils/youtube.js";
import { generateSignedGetUrl } from "../utils/s3.js";
import { AUTHOR_FIELDS, authorView, bad, invalid, isId, paginate } from "../utils/lmsLearning.js";

const MAX_COMMENT = 1000;

const lessonFilter = (req, slug) => ({
  trimester: req.cohort.trimester._id,
  slug: String(slug).toLowerCase(),
  ...(req.cohortRole === "student" ? { published: true } : {}),
});

const findLesson = async (req, res) => {
  const lesson = await Lesson.findOne(lessonFilter(req, req.params.slug));
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return null;
  }
  return lesson;
};

const lessonView = (lesson, doneObjectives = []) => {
  const done = new Set(doneObjectives);
  return {
    _id: lesson._id,
    slug: lesson.slug,
    module: lesson.module,
    title: lesson.title,
    order: lesson.order,
    videoId: lesson.videoId || null,
    ...(lesson.videoId ? { embedUrl: streamDetails(lesson.videoId).embedUrl, watchUrl: streamDetails(lesson.videoId).watchUrl } : { embedUrl: null, watchUrl: null }),
    durationMinutes: lesson.durationMinutes,
    intro: lesson.intro,
    objectives: lesson.objectives.map((text, index) => ({ index, text, done: done.has(index) })),
    concepts: lesson.concepts.map((concept) => ({ title: concept.title, text: concept.text })),
    tip: lesson.tip,
    outro: lesson.outro,
    file: lesson.file?.name ? { name: lesson.file.name, sizeLabel: lesson.file.sizeLabel, downloadable: Boolean(lesson.file.key) } : null,
  };
};

const percentDone = (lesson, doneObjectives) => {
  const valid = new Set(doneObjectives.filter((index) => index < lesson.objectives.length));
  return lesson.objectives.length ? Math.round((valid.size / lesson.objectives.length) * 100) : 0;
};

/** The next lessons and quizzes after this one, in the trimester's lesson order. */
const computeUpNext = async (req, lesson) => {
  const trimester = req.cohort.trimester._id;
  const visible = req.cohortRole === "student" ? { published: true } : {};
  const [lessons, quizzes] = await Promise.all([
    Lesson.find({ trimester, ...visible, _id: { $ne: lesson._id } }).select("slug title order module videoId durationMinutes").lean(),
    LmsQuiz.find({ trimester, ...visible }).select("slug name order module minutes questions").lean(),
  ]);
  const entries = [
    ...lessons.map((entry) => ({
      order: entry.order,
      sameModule: entry.module === lesson.module,
      title: entry.title,
      meta: entry.durationMinutes ? `${entry.durationMinutes} mins` : entry.videoId ? "Video" : "Reading",
      kind: entry.videoId ? "video" : "reading",
      ref: { type: "lesson", slug: entry.slug },
    })),
    ...quizzes.map((entry) => ({
      order: entry.order,
      sameModule: entry.module === lesson.module,
      title: entry.name,
      meta: `${entry.questions.length} questions`,
      kind: "quiz",
      ref: { type: "quiz", slug: entry.slug },
    })),
  ];
  return entries
    .filter((entry) => entry.order > lesson.order)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .slice(0, 3)
    .map(({ title, meta, kind, ref }) => ({ title, meta, kind, ref }));
};

/** GET /api/lms/lessons/:slug */
export const getLessonController = async (req, res, next) => {
  try {
    const lesson = await findLesson(req, res);
    if (!lesson) return;
    const progress = await LessonProgress.findOne({ user: req.user._id, cohort: req.cohort._id, lesson: lesson._id }).lean();
    const doneObjectives = progress?.doneObjectives || [];
    return res.status(200).json({
      lesson: lessonView(lesson, doneObjectives),
      progress: percentDone(lesson, doneObjectives),
      upNext: await computeUpNext(req, lesson),
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/lessons/:slug/file  (short-lived download link for the lesson's attachment) */
export const getLessonFileController = async (req, res, next) => {
  try {
    const lesson = await findLesson(req, res);
    if (!lesson) return;
    if (!lesson.file?.key) return res.status(404).json({ error: "This lesson has no downloadable file" });
    return res.status(200).json({ name: lesson.file.name, sizeLabel: lesson.file.sizeLabel, ...(await generateSignedGetUrl(lesson.file.key)) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/lessons/:slug/objectives  { index, done? } */
export const toggleObjectiveController = async (req, res, next) => {
  try {
    const lesson = await findLesson(req, res);
    if (!lesson) return;
    const { index } = req.body || {};
    const done = req.body?.done !== false;
    if (!Number.isInteger(index) || index < 0 || index >= lesson.objectives.length) {
      return bad(res, "index", `index must be a whole number from 0 to ${lesson.objectives.length - 1}`);
    }
    if (req.body?.done !== undefined && typeof req.body.done !== "boolean") return bad(res, "done", "done must be true or false");

    const update = done ? { $addToSet: { doneObjectives: index } } : { $pull: { doneObjectives: index } };
    const progress = await LessonProgress.findOneAndUpdate(
      { user: req.user._id, cohort: req.cohort._id, lesson: lesson._id },
      update,
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    return res.status(200).json({
      index,
      done,
      doneObjectives: [...progress.doneObjectives].sort((a, b) => a - b),
      progress: percentDone(lesson, progress.doneObjectives),
    });
  } catch (error) {
    next(error);
  }
};

/* ---------- Comments ---------- */

const commentView = (comment, userId, replies = []) => ({
  _id: comment._id,
  author: authorView(comment.author),
  text: comment.text,
  likes: comment.likes.length,
  liked: comment.likes.some((id) => String(id) === String(userId)),
  createdAt: comment.createdAt,
  replies: replies.map((reply) => commentView(reply, userId)),
});

/** GET /api/lms/lessons/:slug/comments?page=&limit= (top-level newest first, replies oldest first) */
export const listCommentsController = async (req, res, next) => {
  try {
    const lesson = await findLesson(req, res);
    if (!lesson) return;
    const { page, limit, skip } = paginate(req.query);
    const scope = { lesson: lesson._id, cohort: req.cohort._id };
    const [parents, total] = await Promise.all([
      LessonComment.find({ ...scope, parent: null }).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("author", AUTHOR_FIELDS),
      LessonComment.countDocuments({ ...scope, parent: null }),
    ]);
    const replies = parents.length
      ? await LessonComment.find({ ...scope, parent: { $in: parents.map((parent) => parent._id) } }).sort({ createdAt: 1 }).populate("author", AUTHOR_FIELDS)
      : [];
    const byParent = new Map();
    for (const reply of replies) {
      const key = String(reply.parent);
      byParent.set(key, [...(byParent.get(key) || []), reply]);
    }
    return res.status(200).json({
      comments: parents.map((parent) => commentView(parent, req.user._id, byParent.get(String(parent._id)))),
      page,
      limit,
      total,
    });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/lessons/:slug/comments  { text, parentId? } */
export const createCommentController = async (req, res, next) => {
  try {
    const lesson = await findLesson(req, res);
    if (!lesson) return;
    const { text, parentId } = req.body || {};
    const fields = {};
    const clean = typeof text === "string" ? text.trim() : "";
    if (!clean) fields.text = "Write something before posting";
    else if (clean.length > MAX_COMMENT) fields.text = `Comments can be up to ${MAX_COMMENT} characters`;

    let parent = null;
    if (parentId !== undefined && parentId !== null) {
      if (!isId(parentId)) fields.parentId = "Invalid parent comment ID";
      else {
        parent = await LessonComment.findOne({ _id: parentId, lesson: lesson._id, cohort: req.cohort._id });
        if (!parent) return res.status(404).json({ error: "The comment you're replying to was not found" });
        if (parent.parent) fields.parentId = "You can only reply to top-level comments";
      }
    }
    if (Object.keys(fields).length) return invalid(res, fields);

    const comment = await LessonComment.create({
      lesson: lesson._id,
      cohort: req.cohort._id,
      author: req.user._id,
      parent: parent?._id ?? null,
      text: clean,
    });
    await comment.populate("author", AUTHOR_FIELDS);
    return res.status(201).json({ comment: commentView(comment, req.user._id) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/lessons/:slug/comments/:id/like  (toggles) */
export const toggleCommentLikeController = async (req, res, next) => {
  try {
    const lesson = await findLesson(req, res);
    if (!lesson) return;
    if (!isId(req.params.id)) return bad(res, "id", "Invalid comment ID format");
    const filter = { _id: req.params.id, lesson: lesson._id, cohort: req.cohort._id };
    const comment = await LessonComment.findOne(filter).select("likes");
    if (!comment) return res.status(404).json({ error: "Comment not found" });

    const liked = !comment.likes.some((id) => String(id) === String(req.user._id));
    const updated = await LessonComment.findOneAndUpdate(
      filter,
      liked ? { $addToSet: { likes: req.user._id } } : { $pull: { likes: req.user._id } },
      { returnDocument: "after" }
    );
    return res.status(200).json({ liked, likes: updated.likes.length });
  } catch (error) {
    next(error);
  }
};
