import { LmsProgress, LmsWeek } from "../models/Lms.model.js";
import { LmsQuiz, QuizAttempt } from "../models/LmsLearning.model.js";
import { flattenItems, isItemUnlocked } from "../utils/lmsSchedule.js";
import { invalid, isTeacher, issueIfComplete } from "../utils/lmsLearning.js";

export const MAX_ATTEMPTS = 3;

const percentOf = (score, total) => (total ? Math.round((score / total) * 100) : 0);

const findQuiz = async (req, res) => {
  const quiz = await LmsQuiz.findOne({
    trimester: req.cohort.trimester._id,
    slug: String(req.params.slug).toLowerCase(),
    ...(req.cohortRole === "student" ? { published: true } : {}),
  });
  if (!quiz) {
    res.status(404).json({ error: "Quiz not found" });
    return null;
  }
  return quiz;
};

const myAttempts = (req, quiz) =>
  QuizAttempt.find({ user: req.user._id, cohort: req.cohort._id, quiz: quiz._id }).sort({ submittedAt: -1 }).lean();

const bestOf = (attempts) => {
  if (!attempts.length) return null;
  const best = attempts.reduce((top, attempt) => (attempt.score > top.score ? attempt : top));
  return { score: best.score, total: best.total, percent: percentOf(best.score, best.total), passed: attempts.some((attempt) => attempt.passed) };
};

const attemptView = (attempt) => ({
  _id: attempt._id,
  score: attempt.score,
  total: attempt.total,
  percent: percentOf(attempt.score, attempt.total),
  passed: attempt.passed,
  answers: attempt.answers,
  submittedAt: attempt.submittedAt,
});

/** GET /api/lms/quizzes/:slug  (questions never include the answers) */
export const getQuizController = async (req, res, next) => {
  try {
    const quiz = await findQuiz(req, res);
    if (!quiz) return;
    const attempts = await myAttempts(req, quiz);
    const unlimited = isTeacher(req);
    return res.status(200).json({
      quiz: {
        _id: quiz._id,
        slug: quiz.slug,
        course: quiz.course,
        name: quiz.name,
        module: quiz.module,
        minutes: quiz.minutes,
        passMark: quiz.passMark,
        questions: quiz.questions.map((question) => ({ prompt: question.prompt, hint: question.hint, options: question.options })),
      },
      attemptsUsed: attempts.length,
      maxAttempts: unlimited ? null : MAX_ATTEMPTS,
      attemptsLeft: unlimited ? null : Math.max(MAX_ATTEMPTS - attempts.length, 0),
      best: bestOf(attempts),
    });
  } catch (error) {
    next(error);
  }
};

/** Marks week items of kind "check" whose lessonRef is this quiz's slug as done (only once their day has started). */
const completeQuizItems = async (req, quiz) => {
  const weeks = await LmsWeek.find({ trimester: req.cohort.trimester._id }).lean();
  const ids = flattenItems(weeks, req.cohort, new Set())
    .filter((item) => item.kind === "check" && item.lessonRef === quiz.slug && isItemUnlocked(item.date))
    .map((item) => item._id);
  if (!ids.length) return [];
  await LmsProgress.findOneAndUpdate({ user: req.user._id, cohort: req.cohort._id }, { $addToSet: { completedItems: { $each: ids } } }, { upsert: true });
  return ids;
};

/** POST /api/lms/quizzes/:slug/attempts  { answers: [Number|null, ...] } */
export const submitQuizAttemptController = async (req, res, next) => {
  try {
    const quiz = await findQuiz(req, res);
    if (!quiz) return;
    const { answers } = req.body || {};
    const total = quiz.questions.length;

    if (!Array.isArray(answers) || answers.length !== total) {
      return invalid(res, { answers: `Send exactly ${total} answers (use null for a question you skipped)` });
    }
    const fields = {};
    answers.forEach((answer, index) => {
      if (answer === null) return;
      if (!Number.isInteger(answer) || answer < 0 || answer >= quiz.questions[index].options.length) {
        fields[`answers[${index}]`] = `Answer ${index + 1} must be an option from 0 to ${quiz.questions[index].options.length - 1}, or null`;
      }
    });
    if (Object.keys(fields).length) return invalid(res, fields);

    const teacher = isTeacher(req);
    const used = await QuizAttempt.countDocuments({ user: req.user._id, cohort: req.cohort._id, quiz: quiz._id });
    if (!teacher && used >= MAX_ATTEMPTS) {
      return res.status(409).json({ error: `You've used all ${MAX_ATTEMPTS} attempts for this quiz` });
    }

    const review = quiz.questions.map((question, index) => ({
      index,
      correct: answers[index] === question.answer,
      correctAnswer: question.answer,
      yourAnswer: answers[index],
    }));
    const score = review.filter((row) => row.correct).length;
    const percent = percentOf(score, total);
    const passed = percent >= quiz.passMark;

    await QuizAttempt.create({ user: req.user._id, cohort: req.cohort._id, quiz: quiz._id, answers, score, total, passed });

    let certificate = null;
    if (passed && req.cohortRole === "student") {
      await completeQuizItems(req, quiz);
      certificate = await issueIfComplete(req.user._id, req.cohort);
    }

    return res.status(200).json({
      score,
      total,
      percent,
      passed,
      passMark: quiz.passMark,
      attemptsUsed: used + 1,
      attemptsLeft: teacher ? null : Math.max(MAX_ATTEMPTS - used - 1, 0),
      review,
      certificateCode: certificate?.code ?? null,
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/quizzes/:slug/attempts/me */
export const getMyQuizAttemptsController = async (req, res, next) => {
  try {
    const quiz = await findQuiz(req, res);
    if (!quiz) return;
    const attempts = await myAttempts(req, quiz);
    return res.status(200).json({ attempts: attempts.map(attemptView), attemptsUsed: attempts.length, best: bestOf(attempts) });
  } catch (error) {
    next(error);
  }
};
