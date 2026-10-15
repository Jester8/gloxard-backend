// LMS learning API checks (lessons, quizzes, assignments, community, certificates, dashboards).
// Needs a running server and FRESH seed data: npm run seed && npm start, then npm run test:lms-learning
// Re-seed before running this or scripts/test-lms.js again; both change shared demo data.
import "dotenv/config";
import { QUIZ } from "../src/seedLms.js";

const PORT = process.env.PORT || 3001;
const BASE = process.env.BASE || `http://localhost:${PORT}`;
let passed = 0;
let failed = 0;

const ok = (condition, message, detail = "") => {
  if (condition) passed++;
  else failed++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${message}${!condition && detail ? `  -> ${detail}` : ""}`);
};

const call = async (method, path, token, body) => {
  const response = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch { /* empty body */ }
  return { status: response.status, data };
};

const signin = async (email) => {
  const { data } = await call("POST", "/api/auth/signin", null, { email, password: "Password123!" });
  return { token: data.token, id: data.user._id };
};

const short = (value) => JSON.stringify(value).slice(0, 160);
const L = "/api/lms";
const correctAnswers = QUIZ.questions.map((question) => question.answer);

const main = async () => {
  const alice = await signin("alice.student@gloxad.com");
  const bob = await signin("bob.student@gloxad.com");
  const jane = await signin("jane.tutor@gloxad.com");
  const john = await signin("john.tutor@gloxad.com");
  const admin = await signin("admin@gloxad.com");

  let r = await call("GET", `${L}/me`, alice.token);
  const cohortId = r.data.activeCohortId;
  const q = `?cohortId=${cohortId}`;

  /* ---------------- instructor overview (baseline, before any grading) ---------------- */
  console.log("\n-- instructor overview");
  r = await call("GET", `${L}/instructor/overview`, jane.token);
  const ov = r.data;
  ok(r.status === 200 && ov.trimesterName.includes("Trimester 2") && ov.active.total === 2, "jane gets the cohort overview", short(ov));
  ok(typeof ov.avgCompletion === "number" && ov.avgCompletion >= 0, "average completion is a percent");
  ok(ov.avgGrade === "B+" && ov.avgGradePercent === 88, "average grade is a letter from graded work (88% -> B+)", `${ov.avgGrade} ${ov.avgGradePercent}`);
  ok(ov.gradingPending === 1 && ov.grading.length === 1, "one submission waiting to be graded");
  ok(ov.grading[0].title === "UI Component Library" && ov.grading[0].student.initials && ov.grading[0].overdue === true && ov.grading[0].submissionId, "grading queue entry has title, student, overdue flag", short(ov.grading[0]));
  ok(ov.nextLiveSession && ov.nextLiveSession.title, "next live session included");
  ok(ov.roster.length === 2 && ov.roster.every((row) => row.email && row.initials && typeof row.progress === "number"), "roster rows have email, initials and progress");
  const aliceRow = ov.roster.find((row) => row.email === "alice.student@gloxad.com");
  const bobRow = ov.roster.find((row) => row.email === "bob.student@gloxad.com");
  ok(aliceRow.attendance === "Present" && bobRow.attendance === "Absent", "attendance comes from the last ended class", `${aliceRow.attendance}/${bobRow.attendance}`);
  ok(aliceRow.progress === 25 && aliceRow.lastActive && !Number.isNaN(Date.parse(aliceRow.lastActive)), "roster progress and ISO lastActive");
  ok(ov.active.now === 2, "both students were active in the last 7 days", short(ov.active));
  r = await call("GET", `${L}/instructor/overview?search=bob&limit=1`, jane.token);
  ok(r.data.roster.length === 1 && r.data.roster[0].email.startsWith("bob") && r.data.pagination.total === 1, "roster search filters by name or email");
  r = await call("GET", `${L}/instructor/overview?limit=1&page=2`, jane.token);
  ok(r.data.roster.length === 1 && r.data.pagination.total === 2 && r.data.pagination.page === 2, "roster pagination");
  ok((await call("GET", `${L}/instructor/overview`, alice.token)).status === 403, "students can't open the instructor overview");
  ok((await call("GET", `${L}/instructor/overview`, john.token)).status === 404, "non-members have no cohort -> 404");
  ok((await call("GET", `${L}/instructor/overview`)).status === 401, "overview needs sign-in");
  ok((await call("GET", `${L}/instructor/overview${q}`, admin.token)).status === 200, "admins can open it too");

  /* ---------------- lessons ---------------- */
  console.log("\n-- lessons");
  const lessonPath = `${L}/lessons/scalable-architecture-patterns`;
  r = await call("GET", lessonPath, alice.token);
  ok(r.status === 200 && r.data.lesson.title.includes("Scalable Architecture") && r.data.lesson.objectives.length === 3, "alice opens the lesson", short(r.data));
  ok(r.data.progress === 33 && r.data.lesson.objectives[0].done === true && r.data.lesson.objectives[1].done === false, "progress counts her completed objectives (1 of 3)");
  ok(r.data.lesson.concepts.length === 3 && r.data.lesson.file.name === "Architecture_Diagrams.pdf" && r.data.lesson.file.key === undefined, "file name shown, storage key never exposed");
  ok(r.data.upNext[0].ref.slug === "database-sharding" && r.data.upNext[0].meta === "18 mins" && r.data.upNext.at(-1).ref.type === "quiz" && r.data.upNext.at(-1).ref.slug === "module-4-quiz", "up next: next lesson, then the quiz", short(r.data.upNext));
  r = await call("GET", lessonPath, bob.token);
  ok(r.data.progress === 0, "bob's progress is his own");
  ok((await call("GET", `${L}/lessons/nope`, alice.token)).status === 404, "unknown lesson -> 404");
  ok((await call("GET", lessonPath + q, john.token)).status === 403, "non-member can't open the lesson");
  ok((await call("GET", lessonPath)).status === 401, "lessons need sign-in");
  r = await call("POST", `${lessonPath}/objectives`, alice.token, { index: 1, done: true });
  ok(r.status === 200 && r.data.progress === 67 && r.data.doneObjectives.join() === "0,1", "tick an objective", short(r.data));
  r = await call("POST", `${lessonPath}/objectives`, alice.token, { index: 1, done: false });
  ok(r.data.progress === 33, "untick an objective");
  r = await call("POST", `${lessonPath}/objectives`, alice.token, { index: 0 });
  ok(r.data.doneObjectives.length === 1, "ticking twice stays idempotent");
  r = await call("POST", `${lessonPath}/objectives`, alice.token, { index: 9 });
  ok(r.status === 400 && r.data.fields.index, "out-of-range objective -> field error");
  ok((await call("GET", `${lessonPath}/file`, alice.token)).status === 404, "lesson without a stored file has no download");
  r = await call("GET", `${L}/curriculum/weeks/2`, alice.token);
  ok(r.data.week.days[0].items[0].lessonRef === "intro-to-graphs", "week items carry their lessonRef");
  r = await call("GET", `${L}/lessons/intro-to-graphs`, alice.token);
  ok(r.status === 200 && r.data.lesson.videoId === null && r.data.lesson.embedUrl === null, "lesson without video has null videoId");

  console.log("\n-- lesson comments");
  r = await call("GET", `${lessonPath}/comments`, alice.token);
  const seeded = r.data.comments[0];
  ok(r.status === 200 && r.data.total === 1 && seeded.replies.length === 1, "seeded thread: one comment with one reply", short(r.data));
  ok(seeded.author.name === "Alice Student" && seeded.author.initials === "AS" && seeded.author.isInstructor === false && seeded.likes === 2 && seeded.liked === false, "comment view: author, initials, likes, liked", short(seeded));
  ok(seeded.replies[0].author.isInstructor === true && seeded.replies[0].liked === true && seeded.author.email === undefined, "instructor reply flagged; no emails leak");
  r = await call("POST", `${lessonPath}/comments`, bob.token, { text: "  Does a message queue count as external state?  " });
  const bobComment = r.data.comment;
  ok(r.status === 201 && bobComment.text === "Does a message queue count as external state?" && bobComment.likes === 0 && bobComment.replies.length === 0, "post a comment (trimmed)", short(r.data));
  r = await call("POST", `${lessonPath}/comments`, alice.token, { text: "Yes, it is state outside the service.", parentId: bobComment._id });
  ok(r.status === 201 && r.data.comment.author.name === "Alice Student", "reply to a comment");
  const replyId = r.data.comment._id;
  r = await call("POST", `${lessonPath}/comments`, bob.token, { text: "Thanks", parentId: replyId });
  ok(r.status === 400 && r.data.fields.parentId, "only one level of replies");
  r = await call("POST", `${lessonPath}/comments`, bob.token, { text: "x".repeat(1001) });
  ok(r.status === 400 && r.data.fields.text, "comments over 1000 characters are rejected");
  r = await call("POST", `${lessonPath}/comments`, bob.token, { text: "   " });
  ok(r.status === 400 && r.data.fields.text, "empty comments are rejected");
  r = await call("POST", `${lessonPath}/comments`, bob.token, { text: "ok", parentId: "000000000000000000000000" });
  ok(r.status === 404, "reply to a missing comment -> 404");
  r = await call("POST", `${lessonPath}/comments`, bob.token, { text: "ok", parentId: "bad" });
  ok(r.status === 400 && r.data.fields.parentId, "malformed parentId -> 400");
  r = await call("GET", `${lessonPath}/comments`, jane.token);
  const thread = r.data.comments.find((comment) => comment._id === bobComment._id);
  ok(r.data.comments[0]._id === bobComment._id && thread.replies.length === 1 && thread.replies[0]._id === replyId, "newest comment first, with its reply nested");
  r = await call("POST", `${lessonPath}/comments/${bobComment._id}/like`, alice.token);
  ok(r.status === 200 && r.data.liked === true && r.data.likes === 1, "like a comment", short(r.data));
  r = await call("GET", `${lessonPath}/comments`, alice.token);
  ok(r.data.comments[0].liked === true && r.data.comments[0].likes === 1, "liked flag shows for the liker");
  r = await call("GET", `${lessonPath}/comments`, bob.token);
  ok(r.data.comments[0].liked === false && r.data.comments[0].likes === 1, "...and not for others");
  r = await call("POST", `${lessonPath}/comments/${bobComment._id}/like`, alice.token);
  ok(r.data.liked === false && r.data.likes === 0, "like toggles off");
  ok((await call("POST", `${lessonPath}/comments/${bobComment._id}/like`, john.token)).status === 404, "no cohortId and no cohort -> 404 for non-members");
  ok((await call("POST", `${lessonPath}/comments/zzz/like`, alice.token)).status === 400, "bad comment id -> 400");

  /* ---------------- quizzes ---------------- */
  console.log("\n-- quizzes");
  const quizPath = `${L}/quizzes/module-4-quiz`;
  r = await call("GET", quizPath, bob.token);
  ok(r.status === 200 && r.data.quiz.questions.length === 10 && r.data.quiz.minutes === 15 && r.data.quiz.passMark === 70, "bob opens the quiz", short(r.data).slice(0, 100));
  ok(!JSON.stringify(r.data).includes('"answer"') && !JSON.stringify(r.data).includes("correctAnswer"), "the quiz never includes the answers");
  ok(r.data.attemptsUsed === 0 && r.data.maxAttempts === 3 && r.data.best === null, "no attempts yet");
  r = await call("GET", quizPath, alice.token);
  ok(r.data.attemptsUsed === 1 && r.data.best.score === 6 && r.data.best.passed === false, "alice has one failed attempt on record", short(r.data.best));
  ok((await call("GET", `${L}/quizzes/nope`, bob.token)).status === 404, "unknown quiz -> 404");
  r = await call("POST", `${quizPath}/attempts`, bob.token, { answers: [0, 1] });
  ok(r.status === 400 && r.data.fields.answers, "wrong-length answers rejected");
  r = await call("POST", `${quizPath}/attempts`, bob.token, {});
  ok(r.status === 400 && r.data.fields.answers, "missing answers rejected");
  r = await call("POST", `${quizPath}/attempts`, bob.token, { answers: correctAnswers.map((a, i) => (i === 3 ? 9 : a)) });
  ok(r.status === 400 && r.data.fields["answers[3]"], "out-of-range option rejected with the question's index", short(r.data));
  r = await call("POST", `${quizPath}/attempts`, bob.token, { answers: correctAnswers.map((a, i) => (i === 0 ? "a" : a)) });
  ok(r.status === 400 && r.data.fields["answers[0]"], "non-number answer rejected");
  r = await call("GET", quizPath, bob.token);
  ok(r.data.attemptsUsed === 0, "rejected submissions don't use an attempt");
  r = await call("POST", `${quizPath}/attempts`, bob.token, { answers: QUIZ.questions.map(() => null) });
  ok(r.status === 200 && r.data.score === 0 && r.data.percent === 0 && r.data.passed === false && r.data.attemptsLeft === 2, "skipped questions score 0 (null allowed)", short(r.data));
  ok(r.data.review.length === 10 && r.data.review[0].correctAnswer === 0 && r.data.review[0].yourAnswer === null && r.data.review[0].correct === false, "review shows the right answer after submitting");
  const mostlyRight = correctAnswers.map((a, i) => (i < 8 ? a : (a + 1) % 2));
  r = await call("POST", `${quizPath}/attempts`, bob.token, { answers: mostlyRight });
  ok(r.data.score === 8 && r.data.percent === 80 && r.data.passed === true && r.data.review.filter((row) => !row.correct).length === 2, "8/10 passes a 70% mark", short(r.data));
  r = await call("POST", `${quizPath}/attempts`, bob.token, { answers: correctAnswers });
  ok(r.data.score === 10 && r.data.percent === 100 && r.data.attemptsLeft === 0, "third and last attempt");
  r = await call("POST", `${quizPath}/attempts`, bob.token, { answers: correctAnswers });
  ok(r.status === 409, "a fourth attempt is refused with 409");
  r = await call("GET", `${quizPath}/attempts/me`, bob.token);
  ok(r.data.attempts.length === 3 && r.data.best.score === 10 && r.data.attempts[0].score === 10 && !JSON.stringify(r.data).includes("correctAnswer"), "attempt history (newest first), best score, no answer key", short(r.data.best));
  r = await call("GET", `${quizPath}/attempts/me`, alice.token);
  ok(r.data.attempts.length === 1, "attempts are per student");
  let teacherOk = true;
  for (let i = 0; i < 4; i++) teacherOk = teacherOk && (await call("POST", `${quizPath}/attempts`, jane.token, { answers: correctAnswers })).status === 200;
  ok(teacherOk, "teachers aren't limited to 3 attempts");
  ok((await call("GET", quizPath, jane.token)).data.maxAttempts === null, "teachers see no attempt limit");
  ok(!JSON.stringify((await call("GET", quizPath, jane.token)).data).includes('"answer"'), "even teachers don't get the answers from the quiz endpoint");

  /* ---------------- assignments ---------------- */
  console.log("\n-- assignments");
  r = await call("GET", `${L}/assignments`, alice.token);
  const list = r.data.assignments;
  const bySlug = Object.fromEntries(list.map((row) => [row.slug, row]));
  ok(r.status === 200 && list.length === 3, "alice sees the 3 assignments", short(list.map((x) => x.slug)));
  const a3 = bySlug["advanced-api-integration"];
  ok(a3.status === "not_started" && a3.progress === 0 && a3.dueLabel === "Due Tomorrow" && a3.urgent === true && a3.past === false && a3.totalPoints === 100 && a3.myScore === null, "upcoming assignment: not started, due tomorrow, urgent", short(a3));
  ok(a3.badge === "Module 3 Project" && a3.module === "Module 3" && a3.summary && !Number.isNaN(Date.parse(a3.dueAt)), "assignment card fields");
  const a2b = bySlug["database-schema-design"];
  ok(a2b.status === "graded" && a2b.progress === 100 && a2b.myScore === 88 && a2b.past === true && a2b.urgent === false && /^Due [A-Z][a-z]{2} \d{2}$/.test(a2b.dueLabel), "graded assignment shows score and a 'Due Oct 15' style label", short(a2b));
  const a2a = bySlug["ui-component-library"];
  ok(a2a.status === "submitted" && a2a.progress === 90 && a2a.myScore === null, "submitted assignment: 90% and no score yet");
  ok(list[0].slug !== "advanced-api-integration" || list.length === 1, "list is ordered by due date");
  r = await call("GET", `${L}/dashboard`, alice.token);
  ok(r.data.progress.assignments.done === 2 && r.data.progress.assignments.total === 3, "dashboard assignments come from real submissions", short(r.data.progress.assignments));
  ok(r.data.upcoming.some((row) => row.type === "assignment" && row.assignmentSlug === "advanced-api-integration") && r.data.upcoming.some((row) => row.type === "live"), "dashboard upcoming has the assignment due and the live class", short(r.data.upcoming.map((x) => x.type)));
  r = await call("GET", `${L}/assignments/database-schema-design`, alice.token);
  ok(r.status === 200 && r.data.assignment.rubric.length === 3 && r.data.assignment.description && r.data.submission.status === "graded" && r.data.submission.score === 88 && r.data.submission.feedback, "assignment detail: rubric, description, my graded submission", short(r.data).slice(0, 120));
  ok(r.data.submission.rubricScores.length === 3 && r.data.submission.gradedBy === undefined, "rubric breakdown visible; grader id not exposed");
  r = await call("GET", `${L}/assignments/database-schema-design`, bob.token);
  ok(r.status === 200 && r.data.submission === null && r.data.assignment.status === "not_started", "bob can't see alice's submission");
  ok((await call("GET", `${L}/assignments/nope`, bob.token)).status === 404, "unknown assignment -> 404");

  const submitPath = `${L}/assignments/ui-component-library/submit`;
  r = await call("POST", submitPath, bob.token, {});
  ok(r.status === 400 && r.data.fields.text, "empty submission rejected");
  r = await call("POST", submitPath, bob.token, { text: "x".repeat(20001) });
  ok(r.status === 400 && r.data.fields.text, "text over 20000 characters rejected");
  r = await call("POST", submitPath, bob.token, { text: "hi", links: ["not a url"] });
  ok(r.status === 400 && r.data.fields.links, "invalid link rejected");
  r = await call("POST", submitPath, bob.token, { text: "hi", links: ["javascript:alert(1)"] });
  ok(r.status === 400 && r.data.fields.links, "non-http link rejected");
  r = await call("POST", submitPath, bob.token, { text: "hi", links: Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`) });
  ok(r.status === 400 && r.data.fields.links, "more than 5 links rejected");
  r = await call("POST", submitPath, bob.token, { text: "hi", attachments: [{ key: `documents/${alice.id}/a.pdf`, name: "a.pdf" }] });
  ok(r.status === 400 && r.data.fields.attachments, "can't attach someone else's file");
  r = await call("POST", submitPath, bob.token, { text: "hi", attachments: [{ key: `documents/${bob.id}/../${alice.id}/a.pdf`, name: "a.pdf" }] });
  ok(r.status === 400 && r.data.fields.attachments, "path traversal in an attachment key rejected");
  r = await call("POST", submitPath, bob.token, { text: "hi", attachments: [{ key: `documents/${bob.id}/a.exe`, name: "a.exe", mimeType: "application/x-msdownload" }] });
  ok(r.status === 400 && r.data.fields.attachments, "disallowed file type rejected");
  r = await call("POST", submitPath, bob.token, { text: "hi", attachments: Array.from({ length: 6 }, (_, i) => ({ key: `documents/${bob.id}/${i}.pdf`, name: `${i}.pdf` })) });
  ok(r.status === 400 && r.data.fields.attachments, "more than 5 attachments rejected");
  ok((await call("POST", submitPath, jane.token, { text: "hi" })).status === 403, "teachers can't submit assignments");
  r = await call("POST", submitPath, bob.token, { text: "My component library.", links: ["https://github.com/bob/ui-kit"], attachments: [{ key: `documents/${bob.id}/ui-kit.pdf`, name: "ui-kit.pdf", size: 2048, mimeType: "application/pdf" }] });
  ok(r.status === 201 && r.data.submission.status === "submitted" && r.data.submission.late === true && r.data.submission.attachments.length === 1, "submit after the due date -> marked late", short(r.data));
  const bobSubmissionId = r.data.submission._id;
  r = await call("POST", submitPath, bob.token, { text: "Improved version." });
  ok(r.status === 200 && r.data.resubmitted === true && r.data.submission._id === bobSubmissionId && r.data.submission.text === "Improved version." && r.data.submission.attachments.length === 0, "resubmitting replaces the earlier work");
  r = await call("POST", `${L}/assignments/advanced-api-integration/submit`, bob.token, { text: "On time." });
  ok(r.status === 201 && r.data.submission.late === false, "submit before the due date -> not late");
  r = await call("GET", `${L}/assignments`, bob.token);
  ok(r.data.assignments.find((row) => row.slug === "advanced-api-integration").status === "submitted" && r.data.assignments.find((row) => row.slug === "advanced-api-integration").urgent === false, "submitted work is no longer urgent");

  console.log("\n-- grading");
  const listPath = `${L}/assignments/ui-component-library/submissions`;
  ok((await call("GET", listPath, alice.token)).status === 403, "students can't list submissions");
  ok((await call("GET", listPath + q, john.token)).status === 403, "non-members can't list submissions");
  r = await call("GET", listPath, jane.token);
  ok(r.status === 200 && r.data.total === 2 && r.data.submissions.every((row) => row.student.email && row.student.name && row.status), "jane lists every student's submission with name and email", short(r.data).slice(0, 140));
  ok(r.data.submissions[0].student.email === "alice.student@gloxad.com" && r.data.assignment.totalPoints === 100 && r.data.totalStudents === 2, "oldest first; assignment totals included");
  r = await call("GET", `${listPath}?status=graded`, jane.token);
  ok(r.data.total === 0, "status filter");
  const gradePath = `${listPath}/${bobSubmissionId}/grade`;
  ok((await call("PUT", gradePath, bob.token, { score: 100 })).status === 403, "students can't grade");
  r = await call("PUT", gradePath, jane.token, { score: 101 });
  ok(r.status === 400 && r.data.fields.score, "score above the total points rejected");
  r = await call("PUT", gradePath, jane.token, { score: -1 });
  ok(r.status === 400 && r.data.fields.score, "negative score rejected");
  r = await call("PUT", gradePath, jane.token, {});
  ok(r.status === 400 && r.data.fields.score, "score is required");
  r = await call("PUT", gradePath, jane.token, { score: 70, rubricScores: [{ criterion: "Accessibility", points: 99 }] });
  ok(r.status === 400 && r.data.fields.rubricScores, "rubric points above the criterion maximum rejected");
  r = await call("PUT", gradePath, jane.token, { score: 70, rubricScores: [{ criterion: "Made up", points: 1 }] });
  ok(r.status === 400 && r.data.fields.rubricScores, "unknown rubric criterion rejected");
  ok((await call("PUT", `${listPath}/000000000000000000000000/grade`, jane.token, { score: 5 })).status === 404, "unknown submission -> 404");
  ok((await call("PUT", `${L}/assignments/database-schema-design/submissions/${bobSubmissionId}/grade`, jane.token, { score: 5 })).status === 404, "submission from another assignment -> 404");
  r = await call("PUT", gradePath, jane.token, { rubricScores: [{ criterion: "Component API and reusability", points: 30 }, { criterion: "Accessibility", points: 25 }, { criterion: "Documentation", points: 20 }], feedback: "Good start." });
  ok(r.status === 200 && r.data.submission.status === "graded" && r.data.submission.score === 75 && r.data.submission.feedback === "Good start." && r.data.submission.rubricScores.length === 3, "grade from rubric scores (total computed)", short(r.data));
  r = await call("GET", `${L}/assignments/ui-component-library`, bob.token);
  ok(r.data.submission.status === "graded" && r.data.assignment.myScore === 75 && r.data.assignment.progress === 100, "bob sees his grade");
  ok((await call("POST", submitPath, bob.token, { text: "again" })).status === 409, "graded work can't be resubmitted");
  r = await call("GET", "/api/notifications", bob.token);
  ok(r.status === 200 && JSON.stringify(r.data).includes("Assignment graded"), "the student is notified of the grade");
  r = await call("PUT", gradePath, jane.token, { score: 80, feedback: "Regraded." });
  ok(r.status === 200 && r.data.submission.score === 80, "teachers can regrade");
  r = await call("GET", `${L}/instructor/overview`, jane.token);
  ok(r.data.gradingPending === 2 && r.data.grading[0].student.name === "Alice Student" && r.data.grading[1].student.name === "Bob Student" && r.data.grading[1].overdue === false, "queue: alice's older work first, then bob's fresh submission", short(r.data.grading.map((row) => [row.title, row.student.name, row.overdue])));
  ok(r.data.avgGrade === "B" && r.data.avgGradePercent === 84, "average grade updates ((88 + 80) / 2 = 84 -> B)", `${r.data.avgGrade} ${r.data.avgGradePercent}`);
  r = await call("GET", listPath, jane.token);
  const aliceSubmission = r.data.submissions.find((row) => row.student.email.startsWith("alice"));
  ok((await call("PUT", `${listPath}/${aliceSubmission._id}/grade`, jane.token, { score: 90, feedback: "Excellent." })).status === 200, "grade alice's submission");
  r = await call("GET", `${L}/instructor/overview`, jane.token);
  ok(r.data.gradingPending === 1 && r.data.grading.length === 1 && r.data.grading[0].assignmentSlug === "advanced-api-integration", "graded work leaves the queue", short(r.data.grading));
  ok(r.data.avgGrade === "B" && r.data.avgGradePercent === 86, "average of 88, 80 and 90 is 86 -> B", `${r.data.avgGrade} ${r.data.avgGradePercent}`);
  r = await call("GET", `${L}/assignments`, jane.token);
  const aUi = r.data.assignments.find((row) => row.slug === "ui-component-library");
  ok(aUi.submissions.graded === 2 && aUi.submissions.students === 2 && aUi.status === null, "teachers see submission counts per assignment", short(aUi.submissions));

  /* ---------------- community ---------------- */
  console.log("\n-- community");
  r = await call("GET", `${L}/community/channels`, alice.token);
  const channels = Object.fromEntries(r.data.channels.map((c) => [c.id, c]));
  ok(r.status === 200 && r.data.channels.length === 4 && channels.general.label === "General" && channels.general.count === 1 && channels.qa.count === 1, "channels with post counts", short(r.data));
  ok(channels.showcase.isNew === true && channels.general.isNew === false, "showcase is new when it has a post from the last 7 days");
  r = await call("GET", `${L}/community/posts`, alice.token);
  ok(r.status === 200 && r.data.total === 4 && r.data.posts[0].pinned === true && r.data.posts[0].author.isInstructor === true && r.data.posts[0].channel === "showcase", "pinned post first, by the instructor", short(r.data.posts[0]));
  const first = r.data.posts[0];
  ok(first.likes === 2 && first.liked === true && first.replies === 0 && first.author.initials === "JT" && first.author.email === undefined, "post view: counts, liked flag, initials, no email", short(first));
  ok(r.data.posts.slice(1).every((post, i, all) => i === 0 || new Date(all[i - 1].createdAt) >= new Date(post.createdAt)), "the rest are newest first");
  r = await call("GET", `${L}/community/posts?channel=qa`, alice.token);
  ok(r.data.total === 1 && r.data.posts[0].title.includes("BFS"), "filter by channel");
  ok((await call("GET", `${L}/community/posts?channel=nope`, alice.token)).status === 400, "unknown channel -> 400");
  r = await call("GET", `${L}/community/posts?limit=2&page=2`, alice.token);
  ok(r.data.posts.length === 2 && r.data.total === 4, "pagination");
  ok((await call("GET", `${L}/community/posts` + q, john.token)).status === 403, "non-members can't read the community");

  r = await call("POST", `${L}/community/posts`, bob.token, { channel: "general", title: "Anyone up for mock interviews?", body: "Looking for a partner for weekly mock interviews." });
  const post = r.data.post;
  ok(r.status === 201 && post.tag === "Discussion" && post.author.name === "Bob Student" && post.likes === 0 && post.replies === 0 && post.liked === false, "create a post (default tag)", short(r.data));
  r = await call("POST", `${L}/community/posts`, bob.token, { channel: "qa", tag: "Help", title: "T", body: "B" });
  ok(r.status === 201 && r.data.post.tag === "Help", "custom tag");
  const bobQa = r.data.post._id;
  r = await call("POST", `${L}/community/posts`, bob.token, { channel: "x", title: "", body: "" });
  ok(r.status === 400 && r.data.fields.channel && r.data.fields.title && r.data.fields.body, "post validation returns every field error", short(r.data));
  r = await call("POST", `${L}/community/posts`, bob.token, { channel: "general", title: "t".repeat(141), body: "b" });
  ok(r.status === 400 && r.data.fields.title, "titles over 140 characters rejected");
  r = await call("POST", `${L}/community/posts`, bob.token, { channel: "general", title: "t", body: "b".repeat(5001) });
  ok(r.status === 400 && r.data.fields.body, "bodies over 5000 characters rejected");

  r = await call("POST", `${L}/community/posts/${post._id}/replies`, alice.token, { body: "I'm in!" });
  ok(r.status === 201 && r.data.reply.author.name === "Alice Student" && r.data.replies === 1, "reply to a post", short(r.data));
  ok((await call("POST", `${L}/community/posts/${post._id}/replies`, alice.token, { body: " " })).status === 400, "empty reply rejected");
  ok((await call("POST", `${L}/community/posts/${post._id}/replies`, alice.token, { body: "r".repeat(2001) })).status === 400, "reply over 2000 characters rejected");
  r = await call("GET", `${L}/community/posts/${post._id}`, jane.token);
  ok(r.status === 200 && r.data.post.replies === 1 && r.data.replies.length === 1 && r.data.replies[0].body === "I'm in!", "post detail includes its replies");
  ok((await call("GET", `${L}/community/posts/000000000000000000000000`, jane.token)).status === 404, "unknown post -> 404");
  ok((await call("GET", `${L}/community/posts/zzz`, jane.token)).status === 400, "bad post id -> 400");

  r = await call("POST", `${L}/community/posts/${post._id}/like`, alice.token);
  ok(r.data.liked === true && r.data.likes === 1, "like a post");
  r = await call("POST", `${L}/community/posts/${post._id}/like`, bob.token);
  ok(r.data.likes === 2, "likes accumulate across users");
  r = await call("POST", `${L}/community/posts/${post._id}/like`, alice.token);
  ok(r.data.liked === false && r.data.likes === 1, "like toggles off");

  ok((await call("PUT", `${L}/community/posts/${post._id}/pin`, bob.token, {})).status === 403, "students can't pin");
  r = await call("PUT", `${L}/community/posts/${post._id}/pin`, jane.token, { pinned: true });
  ok(r.status === 200 && r.data.pinned === true, "teachers can pin");
  await call("PUT", `${L}/community/posts/${post._id}/pin`, jane.token, { pinned: false });

  ok((await call("DELETE", `${L}/community/posts/${bobQa}`, alice.token)).status === 403, "students can't delete other people's posts");
  ok((await call("DELETE", `${L}/community/posts/${bobQa}`, bob.token)).status === 200, "authors can delete their own posts");
  ok((await call("GET", `${L}/community/posts/${bobQa}`, bob.token)).status === 404, "deleted post is gone");
  ok((await call("DELETE", `${L}/community/posts/${post._id}`, jane.token)).status === 200, "teachers can delete any post");
  r = await call("GET", `${L}/community/channels`, alice.token);
  ok(r.data.channels.find((c) => c.id === "general").count === 1, "channel counts follow deletions");

  /* ---------------- admin content ---------------- */
  console.log("\n-- admin content (lessons, quizzes, assignments)");
  const monthAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const mkTrimester = async (name) => (await call("POST", `${L}/admin/trimesters`, admin.token, { name, programName: `${name} Program`, startsAt: monthAgo, endsAt: "2027-06-01", status: "running" })).data.trimester._id;
  const t1 = await mkTrimester("Trimester X");
  const t2 = await mkTrimester("Trimester Y");
  const body = { trimesterId: t1, slug: "caching-basics", title: "Caching Basics", module: "Module 5", order: 50, videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", objectives: ["Explain cache hits"], concepts: [{ title: "TTL", text: "Time to live" }] };
  ok((await call("POST", `${L}/admin/lessons`, alice.token, body)).status === 403, "students can't create lessons");
  r = await call("POST", `${L}/admin/lessons`, admin.token, body);
  ok(r.status === 201 && r.data.lesson.videoId === "dQw4w9WgXcQ" && r.data.lesson.slug === "caching-basics", "admin creates a lesson; any YouTube link becomes the 11-character id", short(r.data));
  r = await call("POST", `${L}/admin/lessons`, admin.token, body);
  ok(r.status === 400 && r.data.fields.slug, "duplicate lesson slug -> field error");
  r = await call("POST", `${L}/admin/lessons`, admin.token, { ...body, slug: "bad-video", videoUrl: "https://vimeo.com/1" });
  ok(r.status === 400 && r.data.fields.videoUrl, "non-YouTube link rejected");
  r = await call("POST", `${L}/admin/lessons`, admin.token, { ...body, slug: "Bad Slug" });
  ok(r.status === 400 && r.data.fields.slug, "invalid slug rejected");
  r = await call("POST", `${L}/admin/lessons`, admin.token, { slug: "x", title: "X" });
  ok(r.status === 400 && r.data.fields.trimesterId, "trimesterId required");
  r = await call("PUT", `${L}/admin/lessons/caching-basics`, admin.token, { trimesterId: t1, title: "Caching Basics (v2)", slug: "hijack", videoUrl: "" });
  ok(r.status === 200 && r.data.lesson.title.endsWith("(v2)") && r.data.lesson.slug === "caching-basics" && r.data.lesson.videoId === "", "update a lesson (slug immutable, empty videoUrl clears it)");
  ok((await call("PUT", `${L}/admin/lessons/missing`, admin.token, { trimesterId: t1, title: "x" })).status === 404, "updating a missing lesson -> 404");

  const quizBody = { trimesterId: t1, slug: "cache-quiz", name: "Cache Quiz", minutes: 5, questions: [{ prompt: "Q1?", options: ["a", "b"], answer: 1 }] };
  r = await call("POST", `${L}/admin/quizzes`, admin.token, { ...quizBody, questions: [{ prompt: "Q1?", options: ["a", "b"], answer: 5 }] });
  ok(r.status === 400 && r.data.fields["questions[0]"], "answer outside the options rejected");
  r = await call("POST", `${L}/admin/quizzes`, admin.token, { ...quizBody, questions: [{ prompt: "Q1?", options: ["a"], answer: 0 }] });
  ok(r.status === 400 && r.data.fields["questions[0]"], "fewer than 2 options rejected");
  r = await call("POST", `${L}/admin/quizzes`, admin.token, { ...quizBody, passMark: 150 });
  ok(r.status === 400 && r.data.fields.passMark, "passMark above 100 rejected");
  r = await call("POST", `${L}/admin/quizzes`, admin.token, quizBody);
  ok(r.status === 201 && r.data.quiz.passMark === 70, "admin creates a quiz (passMark defaults to 70)");
  r = await call("PUT", `${L}/admin/quizzes/cache-quiz`, admin.token, { trimesterId: t1, passMark: 50 });
  ok(r.status === 200 && r.data.quiz.passMark === 50 && r.data.quiz.questions.length === 1, "update a quiz");

  const asBody = { trimesterId: t1, slug: "cache-project", title: "Cache Project", weekNumber: 1, dueDayIndex: 3, rubric: [{ criterion: "Design", points: 60 }, { criterion: "Tests", points: 40 }] };
  r = await call("POST", `${L}/admin/assignments`, admin.token, { ...asBody, dueDayIndex: 9 });
  ok(r.status === 400 && r.data.fields.dueDayIndex, "dueDayIndex outside 0-6 rejected");
  r = await call("POST", `${L}/admin/assignments`, admin.token, { ...asBody, rubric: [] });
  ok(r.status === 400 && r.data.fields.rubric, "empty rubric rejected");
  r = await call("POST", `${L}/admin/assignments`, admin.token, { ...asBody, dueTime: "25:00" });
  ok(r.status === 400 && r.data.fields.dueTime, "bad dueTime rejected");
  r = await call("POST", `${L}/admin/assignments`, admin.token, asBody);
  ok(r.status === 201 && r.data.assignment.dueTime === "23:59", "admin creates an assignment (dueTime defaults to 23:59)");
  r = await call("PUT", `${L}/admin/assignments/cache-project`, admin.token, { trimesterId: t1, dueTime: "12:00", rubric: [{ criterion: "Design", points: 100 }] });
  ok(r.status === 200 && r.data.assignment.dueTime === "12:00" && r.data.assignment.rubric[0].points === 100, "update an assignment");

  /* ---------------- certificates ---------------- */
  console.log("\n-- certificates");
  r = await call("GET", `${L}/certificates`, alice.token);
  ok(r.status === 200 && r.data.earned.length === 1 && r.data.earned[0].code === "GLX-DEMO01" && r.data.earned[0].badge === "Gloxad Certified" && r.data.earned[0].title === "Full-Stack Web Development", "alice has her Trimester 1 certificate", short(r.data.earned));
  ok(r.data.inProgress.length === 1 && r.data.inProgress[0].title === "Data Structures & Algorithms" && /^[A-Z][a-z]{2} \d{4}$/.test(r.data.inProgress[0].expected) && r.data.inProgress[0].progress === 25 && r.data.inProgress[0].cohortId === cohortId, "...and is working toward the current one", short(r.data.inProgress));
  r = await call("GET", `${L}/certificates`, bob.token);
  ok(r.data.earned.length === 0 && r.data.inProgress.length === 1, "bob has none yet");
  ok((await call("GET", `${L}/certificates`)).status === 401, "certificates need sign-in");
  r = await call("GET", `${L}/certificates`, john.token);
  ok(r.status === 200 && r.data.earned.length === 0 && r.data.inProgress.length === 0, "users outside any cohort get empty lists (not a 404)");

  // Cohort X: week 1 has a quiz-linked check item and a reading item. Cohort Y: week 1 is just a quiz-linked check item.
  const weekBody = (items) => ({ objective: { title: "Week" }, days: [{ dayIndex: 0, module: "M", title: "Day", items }] });
  await call("PUT", `${L}/admin/trimesters/${t1}/weeks/1`, admin.token, weekBody([{ kind: "check", label: "Cache quiz", lessonRef: "cache-quiz" }, { kind: "reading", label: "Read" }]));
  await call("PUT", `${L}/admin/trimesters/${t2}/weeks/1`, admin.token, weekBody([{ kind: "check", label: "Y quiz", lessonRef: "y-quiz" }]));
  await call("POST", `${L}/admin/quizzes`, admin.token, { trimesterId: t2, slug: "y-quiz", name: "Y Quiz", questions: [{ prompt: "Q?", options: ["a", "b"], answer: 0 }] });
  const mkCohort = async (name, trimesterId, studentIds) => (await call("POST", `${L}/admin/cohorts`, admin.token, { name, trimesterId, instructorId: jane.id, startsAt: monthAgo, studentIds })).data.cohort._id;
  const cx = await mkCohort("Cohort X", t1, [bob.id, alice.id]);
  const cy = await mkCohort("Cohort Y", t2, [bob.id]);

  r = await call("GET", `${L}/lessons/caching-basics?cohortId=${cx}`, bob.token);
  ok(r.status === 200 && r.data.lesson.title.includes("v2"), "lessons are scoped to the cohort's trimester (cohortId)");
  ok((await call("GET", `${L}/lessons/caching-basics`, bob.token)).status === 404, "...and invisible from another trimester");
  r = await call("GET", `${L}/certificates`, bob.token);
  ok(r.data.inProgress.length === 3, "bob is now working toward three programmes", short(r.data.inProgress.map((x) => [x.title, x.progress])));

  r = await call("POST", `${L}/quizzes/cache-quiz/attempts?cohortId=${cx}`, bob.token, { answers: [0] });
  ok(r.status === 200 && r.data.passed === false && r.data.certificateCode === null, "failing the quiz completes nothing");
  r = await call("GET", `${L}/curriculum/weeks/1?cohortId=${cx}`, bob.token);
  ok(r.data.week.progress === 0, "no progress after a failed attempt");
  r = await call("POST", `${L}/quizzes/cache-quiz/attempts?cohortId=${cx}`, bob.token, { answers: [1] });
  ok(r.status === 200 && r.data.passed === true && r.data.certificateCode === null, "passing the quiz", short(r.data));
  r = await call("GET", `${L}/curriculum/weeks/1?cohortId=${cx}`, bob.token);
  const dayItems = r.data.week.days[0].items;
  ok(dayItems[0].done === true && dayItems[1].done === false && r.data.week.progress === 50, "passing marks the linked 'check' item complete in the weekly plan", short(dayItems));
  ok((await call("GET", `${L}/certificates`, bob.token)).data.earned.length === 0, "50% progress earns no certificate");
  r = await call("POST", `${L}/progress?cohortId=${cx}`, bob.token, { itemId: dayItems[1]._id });
  ok(r.status === 200 && r.data.certificateCode && /^GLX-[A-Z0-9]{6}$/.test(r.data.certificateCode), "finishing the last item auto-issues the certificate", short(r.data));
  const code = r.data.certificateCode;
  r = await call("GET", `${L}/certificates`, bob.token);
  ok(r.data.earned.length === 1 && r.data.earned[0].code === code && r.data.earned[0].title === "Trimester X Program" && r.data.earned[0].subtitle === "Trimester X Core Curriculum" && String(r.data.earned[0].cohortId) === cx, "the certificate is listed with program title and code", short(r.data.earned));
  ok(r.data.inProgress.length === 2 && !r.data.inProgress.some((row) => row.cohortId === cx), "...and the finished cohort leaves 'in progress'");
  r = await call("POST", `${L}/progress?cohortId=${cx}`, bob.token, { itemId: dayItems[1]._id });
  ok(r.status === 200 && r.data.certificateCode === null, "progress updates after that don't re-issue");
  await call("POST", `${L}/progress?cohortId=${cx}`, bob.token, { itemId: dayItems[1]._id, completed: false });
  await call("POST", `${L}/progress?cohortId=${cx}`, bob.token, { itemId: dayItems[1]._id });
  ok((await call("GET", `${L}/certificates`, bob.token)).data.earned.length === 1, "undo and redo keeps a single certificate (idempotent)");
  r = await call("POST", `${L}/quizzes/y-quiz/attempts?cohortId=${cy}`, bob.token, { answers: [0] });
  ok(r.status === 200 && r.data.passed && /^GLX-/.test(r.data.certificateCode), "passing a quiz can finish a course and issue the certificate too", short(r.data));
  ok((await call("GET", `${L}/certificates`, bob.token)).data.earned.length === 2, "bob now holds two certificates");
  ok((await call("GET", `${L}/certificates`, alice.token)).data.earned.length === 1, "certificates are per user");

  console.log("\n-- manual certificates");
  ok((await call("POST", `${L}/admin/certificates`, alice.token, { userId: alice.id, cohortId: cx })).status === 403, "students can't issue certificates");
  ok((await call("POST", `${L}/admin/certificates`, jane.token, { userId: alice.id, cohortId: cx })).status === 403, "instructors can't either");
  ok((await call("POST", `${L}/admin/certificates`, admin.token, { userId: "x", cohortId: cx })).status === 400, "bad userId -> 400");
  ok((await call("POST", `${L}/admin/certificates`, admin.token, { userId: john.id, cohortId: cx })).status === 400, "user outside the cohort -> 400");
  ok((await call("POST", `${L}/admin/certificates`, admin.token, { userId: alice.id, cohortId: cx, badge: "Nope" })).status === 400, "unknown badge -> 400");
  ok((await call("POST", `${L}/admin/certificates`, admin.token, { userId: alice.id, cohortId: "000000000000000000000000" })).status === 404, "unknown cohort -> 404");
  r = await call("POST", `${L}/admin/certificates`, admin.token, { userId: alice.id, cohortId: cx, badge: "Specialization" });
  ok(r.status === 201 && r.data.certificate.badge === "Specialization" && /^GLX-/.test(r.data.certificate.code), "admin issues a certificate manually", short(r.data));
  const manualCode = r.data.certificate.code;
  r = await call("POST", `${L}/admin/certificates`, admin.token, { userId: alice.id, cohortId: cx });
  ok(r.status === 200 && r.data.certificate.code === manualCode, "issuing again returns the existing certificate");
  r = await call("GET", `${L}/certificates`, alice.token);
  ok(r.data.earned.length === 2 && r.data.earned.some((c) => c.badge === "Specialization"), "alice's list includes it");

  /* ---------------- admin overview ---------------- */
  console.log("\n-- admin overview");
  r = await call("GET", `${L}/admin/overview`, admin.token);
  const ao = r.data;
  ok(r.status === 200 && typeof ao.revenue.total === "number" && ao.revenue.currency && ao.revenue.byCurrency, "revenue from successful transactions", short(ao.revenue));
  ok(ao.enrollments.total >= 0 && typeof ao.enrollments.newThisMonth === "number" && ao.enrollments.newThisMonth <= ao.enrollments.total, "enrollment counts", short(ao.enrollments));
  ok(Array.isArray(ao.enrollmentTrend) && ao.enrollmentTrend.length === 6 && ao.enrollmentTrend.every((n) => Number.isInteger(n)), "six monthly enrollment counts", short(ao.enrollmentTrend));
  ok(ao.enrollmentTrend.reduce((a, b) => a + b, 0) >= ao.enrollments.newThisMonth, "trend includes this month's enrolments");
  ok(typeof ao.completionRate === "number" && ao.completionRate >= 0 && ao.completionRate <= 100, "completion rate is a percent", String(ao.completionRate));
  ok(ao.completionRate > 0, "completion rate counts finished (student, cohort) pairs", String(ao.completionRate));
  ok(ao.platformHealth.status === "ok" && ao.platformHealth.database === "connected" && ao.platformHealth.processUptimeSeconds >= 0 && ao.platformHealth.uptimePercent === undefined, "platform health reports measured values only", short(ao.platformHealth));
  ok(ao.recentCertificates.length >= 3 && ao.recentCertificates.every((row) => row.title && row.who && row.issuedAt), "recent certificates", short(ao.recentCertificates[0]));
  ok(ao.recentCertificates[0].who.length > 0 && !JSON.stringify(ao.recentCertificates).includes("@"), "recent certificates show names, not emails");
  ok((await call("GET", `${L}/admin/overview`, jane.token)).status === 403, "instructors can't open the admin overview");
  ok((await call("GET", `${L}/admin/overview`, alice.token)).status === 403, "students can't open the admin overview");
  ok((await call("GET", `${L}/admin/overview`)).status === 401, "admin overview needs sign-in");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch((error) => {
  console.error("\nTest run crashed:", error);
  process.exit(1);
});
