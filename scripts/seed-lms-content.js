// Non-destructive loader for the trimester LMS content. Safe to run repeatedly against production.
//
//   npm run seed:lms                       creates whatever is missing, leaves everything that exists untouched
//   npm run seed:lms -- --update           also refreshes lesson, quiz, assignment and lab content (never weeks)
//
// Env: LMS_TRIMESTER_START (YYYY-MM-DD, default next Monday), LMS_TRIMESTER_NAME ("Trimester 2"),
//      LMS_PROGRAM_NAME ("Data Structures & Algorithms"), plus the usual MONGODB_URI.
//
// It only ever reads and inserts in the LMS content collections (Trimester, LmsWeek, CodeLab, Lesson, LmsQuiz, Assignment).
// It creates no users and no cohorts, and it deletes nothing. Use scripts/seed.js only on throwaway databases.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import { CodeLab, LmsWeek, Trimester } from "../src/models/Lms.model.js";
import { Assignment, Lesson, LmsQuiz } from "../src/models/LmsLearning.model.js";
import { ASSIGNMENTS, LAB, LESSONS, QUIZ, WEEKS } from "../src/seedLms.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const update = process.argv.includes("--update");

const nextMonday = () => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(today.getTime() + (((8 - today.getUTCDay()) % 7) || 7) * DAY_MS);
};

const parseStart = () => {
  const raw = process.env.LMS_TRIMESTER_START;
  if (!raw) return nextMonday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime())) {
    throw new Error(`LMS_TRIMESTER_START must look like 2026-11-02 (got "${raw}")`);
  }
  return new Date(`${raw}T00:00:00Z`);
};

const tally = { created: [], found: [], updated: [] };
const log = (bucket, label) => {
  tally[bucket].push(label);
  console.log(`${bucket === "created" ? "  + created" : bucket === "updated" ? "  ~ updated" : "  = found  "} ${label}`);
};

/** Creates `data` when no document matches `filter`; with --update, refreshes `refresh` fields on a match. */
const ensure = async (Model, filter, data, label, refresh = null) => {
  const existing = await Model.findOne(filter);
  if (!existing) {
    await Model.create(data);
    return log("created", label);
  }
  if (update && refresh) {
    existing.set(refresh);
    await existing.save();
    return log("updated", label);
  }
  return log("found", label);
};

const main = async () => {
  const startsAt = parseStart();
  const name = process.env.LMS_TRIMESTER_NAME || "Trimester 2";
  const programName = process.env.LMS_PROGRAM_NAME || "Data Structures & Algorithms";
  if (startsAt.getUTCDay() !== 1) console.warn(`Warning: ${startsAt.toISOString().slice(0, 10)} is not a Monday. Cohorts normally start on a Monday.`);

  await connectDB();
  console.log(`Loading LMS content for "${name}: ${programName}"${update ? " (--update)" : ""}\n`);

  console.log("Trimester");
  let trimester = await Trimester.findOne({ name, programName });
  if (trimester) log("found", `${name}: ${programName} (starts ${trimester.startsAt.toISOString().slice(0, 10)}, status ${trimester.status})`);
  else {
    trimester = await Trimester.create({ name, programName, startsAt, endsAt: new Date(startsAt.getTime() + 28 * DAY_MS), status: "open", currency: "NGN" });
    log("created", `${name}: ${programName} (starts ${startsAt.toISOString().slice(0, 10)}, status open)`);
  }

  // Weeks are only ever created: replacing one would orphan the item ids students' progress points at.
  console.log("\nWeeks");
  for (const week of WEEKS) {
    await ensure(LmsWeek, { trimester: trimester._id, weekNumber: week.weekNumber }, { ...week, trimester: trimester._id }, `Week ${week.weekNumber}: ${week.objective.title}`);
  }

  console.log("\nCoding lab");
  const { slug: labSlug, ...labFields } = LAB;
  await ensure(CodeLab, { slug: labSlug }, { ...LAB, trimester: trimester._id }, LAB.title, labFields);

  console.log("\nLessons");
  for (const lesson of LESSONS) {
    const { slug, ...fields } = lesson;
    await ensure(Lesson, { trimester: trimester._id, slug }, { ...lesson, trimester: trimester._id }, lesson.title, fields);
  }

  console.log("\nQuiz");
  const { slug: quizSlug, ...quizFields } = QUIZ;
  await ensure(LmsQuiz, { trimester: trimester._id, slug: quizSlug }, { ...QUIZ, trimester: trimester._id }, `${QUIZ.name} (${QUIZ.questions.length} questions)`, quizFields);

  console.log("\nAssignments");
  for (const assignment of ASSIGNMENTS) {
    const { slug, ...fields } = assignment;
    await ensure(Assignment, { trimester: trimester._id, slug }, { ...assignment, trimester: trimester._id }, assignment.title, fields);
  }

  console.log(`\nDone: ${tally.created.length} created, ${tally.updated.length} updated, ${tally.found.length} already present.`);
  console.log("No users, cohorts or other collections were touched, and nothing was deleted.");
};

main()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error("\nSeeding failed:", error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
