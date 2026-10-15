# Specification: Unit 18 - LMS Learning API (`/api/lms/*`)

Extends [Unit 17](17-trimester-lms-api.md): lessons, quizzes, assignments and grading, community, certificates and the instructor/admin dashboards. Same conventions: `Authorization: Bearer <token>`, errors are `{ "error": "<message>" }` with `"fields": { "<path>": "<message>" }` for validation failures, and the cohort context (`?cohortId=`, default = the user's most recent active cohort; `404` = no cohort, `403` = not a member). "Teacher" means the cohort's instructor or an admin (`req.cohortRole`).

Content (lessons, quizzes, assignments) belongs to a **trimester**; everything a student does (progress, attempts, submissions, comments, posts) belongs to a **cohort**. Slugs are unique per trimester and are resolved against the trimester of the request's cohort. Content has a `published` flag (default `true`); students get `404` for unpublished content.

Person objects never include an email, except the teacher-only submissions list and roster: `author = { _id, name, initials, isInstructor }` (`isInstructor` is true for the instructor and admins).

## Lessons

| Method | Path | Notes |
|---|---|---|
| GET | `/lessons/:slug` | `{ lesson, progress, upNext }`. `lesson`: `{ _id, slug, module, title, order, videoId, embedUrl, watchUrl, durationMinutes, intro, objectives: [{ index, text, done }], concepts: [{ title, text }], tip, outro, file: { name, sizeLabel, downloadable } \| null }`. The storage `key` is never returned. `progress` = percent of the lesson's objectives the caller has ticked. `upNext` (max 3) = the next lessons/quizzes by `order`: `[{ title, meta, kind: video\|reading\|quiz, ref: { type: lesson\|quiz, slug } }]` |
| GET | `/lessons/:slug/file` | Short-lived download link for the lesson attachment (`404` when there is none) |
| POST | `/lessons/:slug/objectives` | `{ index, done? }` (`done` defaults to `true`). Returns `{ index, done, doneObjectives, progress }`. `400` for an out-of-range `index` |
| GET | `/lessons/:slug/comments` | `?page=&limit=` (default 20, max 50). Top-level comments newest first with replies oldest first: `{ comments: [{ _id, author, text, likes, liked, createdAt, replies: [...] }], page, limit, total }` |
| POST | `/lessons/:slug/comments` | `{ text, parentId? }`. Text 1-1000 characters. One reply level only (`400` on `parentId` when replying to a reply). Limit: 40 per minute. Returns `201 { comment }` |
| POST | `/lessons/:slug/comments/:id/like` | Toggles. `{ liked, likes }` |

Lessons are created by admins with `videoUrl` (any YouTube link); the 11-character id is stored as `videoId`. Week items link to a lesson (or quiz) through their existing `lessonRef` field, which holds the slug.

## Quizzes

| Method | Path | Notes |
|---|---|---|
| GET | `/quizzes/:slug` | `{ quiz: { _id, slug, course, name, module, minutes, passMark, questions: [{ prompt, hint, options }] }, attemptsUsed, maxAttempts, attemptsLeft, best }`. **Answers are never returned.** `best` = `{ score, total, percent, passed }` or `null`. Teachers have `maxAttempts: null` |
| POST | `/quizzes/:slug/attempts` | `{ answers: [Number\|null, ...] }`: exactly one entry per question; `null` = skipped. Graded on the server. Returns `{ score, total, percent, passed, passMark, attemptsUsed, attemptsLeft, review: [{ index, correct, correctAnswer, yourAnswer }], certificateCode }`. `400` with field errors (`answers`, or `answers[3]` for one bad entry); `409` after 3 attempts (teachers unlimited). Rejected submissions don't use an attempt. Limit: 20 per 15 minutes |
| GET | `/quizzes/:slug/attempts/me` | `{ attempts: [{ _id, score, total, percent, passed, answers, submittedAt }], attemptsUsed, best }`, newest first, no answer key |

When a **student passes**, every week item of kind `check` whose `lessonRef` equals the quiz slug (and whose day has started) is marked complete in `LmsProgress`, then the certificate check below runs. `certificateCode` is set only when this attempt issued a certificate.

## Assignments

Due date = cohort start + `(weekNumber - 1) * 7 + dueDayIndex` days, at `dueTime` (default `23:59`) in the LMS timezone.

| Method | Path | Notes |
|---|---|---|
| GET | `/assignments` | `{ assignments: [{ _id, slug, module, title, summary, badge, weekNumber, dueAt, dueLabel, urgent, past, status, progress, totalPoints, myScore, late }] }` ordered by due date. `dueLabel`: `Due Today`, `Due Tomorrow`, or `Due Oct 15`. `status`: `not_started` \| `submitted` \| `graded` (a late-reviewed submission stays `submitted`; the frontend maps it to "pending review"). `progress`: 0 / 90 / 100. `urgent` = due in under 48h and not submitted. For teachers `status`/`progress` are `null` and each row has `submissions: { submitted, graded, total, students }` |
| GET | `/assignments/:slug` | `{ assignment: { ...card fields, description, dueTime, rubric: [{ criterion, points }] }, submission }`. `submission` is the caller's own (or `null`): `{ _id, text, links, attachments, status, score, feedback, rubricScores, gradedAt, submittedAt, late }` |
| POST | `/assignments/:slug/submit` | Students only. `{ text?, links?, attachments? }`: text up to 20,000 characters; up to 5 `http(s)` links; up to 5 attachments `{ key, name, size, mimeType }` whose key is `documents/<yourUserId>/...` (upload first with `POST /api/upload/presigned-url`, `folder: "documents"`); images, PDF, ZIP, text, JSON; 10 MB each. At least one of the three is required. First submit `201`, resubmit `200 { resubmitted: true }` (replaces the earlier work); `409` once graded. `late` = submitted after the due date (evaluated at the latest submission). Limit: 20 per 15 minutes |
| GET | `/assignments/:slug/submissions` | Teachers. `?status=submitted\|graded&page=&limit=` (default 50, oldest first). `{ assignment, submissions: [{ ...submission, student: { _id, name, email, initials } }], totalStudents, page, limit, total }` |
| PUT | `/assignments/:slug/submissions/:id/grade` | Teachers. `{ score?, feedback?, rubricScores?: [{ criterion, points }] }`. `score` is required unless `rubricScores` is given (then it is their sum). `score` must be 0..totalPoints; each rubric entry must name a criterion and stay within its points. Sets `status: "graded"` and notifies the student (in-app + socket). Regrading is allowed |

Students never see another student's submission: `GET /assignments/:slug` only returns the caller's own, and the submissions list is teacher-only.

## Community

Posts belong to a cohort; channels: `general`, `qa`, `showcase`, `study`.

| Method | Path | Notes |
|---|---|---|
| GET | `/community/channels` | `{ channels: [{ id, label, count, isNew }] }`; `isNew` = Project Showcase has a post from the last 7 days |
| GET | `/community/posts` | `?channel=&page=&limit=` (default 20, max 50). Pinned first, then newest. `{ posts: [{ _id, author, channel, tag, title, body, likes, liked, replies, pinned, createdAt }], page, limit, total }` |
| POST | `/community/posts` | `{ channel, title (<=140), body (<=5000), tag? (<=30; defaults per channel) }` -> `201 { post }`. Limit: 30 writes per 15 minutes (posts and replies) |
| GET | `/community/posts/:id` | `{ post, replies: [{ _id, author, body, createdAt }] }` oldest first |
| POST | `/community/posts/:id/replies` | `{ body (<=2000) }` -> `201 { reply, replies }` |
| POST | `/community/posts/:id/like` | Toggles. `{ liked, likes }` |
| PUT | `/community/posts/:id/pin` | Teachers. `{ pinned? }` (toggles by default) |
| DELETE | `/community/posts/:id` | The author or a teacher; also removes the replies |

## Certificates

| Method | Path | Notes |
|---|---|---|
| GET | `/certificates` | Across **all** the caller's cohorts (no cohort context). `{ earned: [{ _id, code, badge, title, subtitle, completedAt, cohortId, trimesterId }], inProgress: [{ cohortId, trimester, title, expected, expectedAt, progress }] }`. `expected` is the month and year the trimester ends (`Nov 2026`). Users in no cohort get empty lists |
| POST | `/admin/certificates` | Admin. `{ userId, cohortId, badge? }` (`Gloxad Certified` default, or `Specialization`). The user must be a student of the cohort. `201` when issued, `200` when it already existed |

A certificate (`code` like `GLX-7K3QXM`, unique) is issued automatically and idempotently when a student's overall progress reaches 100%: from `POST /progress` (the response gains `certificateCode`, `null` unless this call issued one) and from passing a linked quiz. Title = the trimester's program name, subtitle = `<trimester name> Core Curriculum`.

## Dashboards

| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | Unchanged shape, with: `progress.assignments` from real assignment submissions (`{ done, total }`; plans without assignments fall back to the problem/submission items); `upcoming[]` now also includes `{ type: "assignment", title, detail, dueAt, dueLabel, assignmentSlug }` for work not yet submitted and due within 7 days (the 4 soonest items/classes, plus up to 3 assignments); items carry `lessonRef`, and `upNext.lessonRef` points at the lesson or quiz slug |
| GET | `/instructor/overview` | Teachers. `?cohortId=&page=&limit=&search=`. `{ cohort, trimesterName, trimester, avgCompletion, active: { now, total }, avgGrade, avgGradePercent, gradingPending, grading: [{ assignmentSlug, module, title, submissionId, student: { name, initials }, submittedAt, overdue }], nextLiveSession, attendanceSession, roster: [{ userId, name, email, initials, attendance, progress, lastActive }], pagination: { page, limit, total } }` |
| GET | `/admin/overview` | Admin. `{ revenue: { total, currency, byCurrency }, enrollments: { total, newThisMonth }, completionRate, platformHealth, enrollmentTrend, enrollmentTrendStart, recentCertificates: [{ title, who, issuedAt }] }` |

Definitions:

- `active.now` = students with any progress update, live-class attendance, class chat message, submission or quiz attempt in the last 7 days.
- `avgGrade` = letter for the mean of `score / totalPoints` over graded submissions (`A+ 97, A 93, A- 90, B+ 87, B 83, B- 80, C+ 77, C 73, C- 70, D 60, F`); `null` when nothing is graded.
- `grading` = ungraded submissions, oldest first, max 10; `overdue` = waiting longer than 3 days. `gradingPending` counts all of them.
- `roster[].attendance` = `Present` / `Absent` for the most recent **ended** live class (`attendanceSession`); `null` when no class has ended. There is no "Excused" state in the data.
- `roster[].lastActive` = most recent of the activities above (ISO) or `null`.
- `revenue` sums `Transaction`s with `status: "success"`; amounts in different currencies are never added together: `total`/`currency` is the largest currency, `byCurrency` has them all.
- `enrollments` counts course `Enrollment` documents (`enrolledAt` for "this month"); `enrollmentTrend` = the last 6 calendar months (UTC), oldest first, starting at `enrollmentTrendStart` (`YYYY-MM`).
- `completionRate` = share of (student, cohort) pairs at 100% progress, across all cohorts; `null` when there are no students.
- `platformHealth` = `{ status: ok\|degraded, database, processUptimeSeconds }`. There is no uptime history to compute a percentage from, so none is reported.

## Admin content

`POST` creates (`trimesterId` and `slug` required, slug `[a-z0-9-]`, unique per trimester: `400 fields.slug` on a duplicate). `PUT /:slug` patches the listed fields (`trimesterId` in the body or query identifies the trimester; `slug` cannot change).

| Method | Path | Body |
|---|---|---|
| POST, PUT | `/admin/lessons[/:slug]` | `{ trimesterId, slug, title, module?, order?, videoUrl?, durationMinutes?, intro?, objectives?: [String], concepts?: [{ title, text }], tip?, outro?, file?: { name, sizeLabel, key }, published? }`. `videoUrl` accepts any YouTube link (empty clears it) |
| POST, PUT | `/admin/quizzes[/:slug]` | `{ trimesterId, slug, name, course?, module?, order?, minutes?, passMark? (1-100, default 70), questions: [{ prompt, hint?, options: [2-6], answer }], published? }` |
| POST, PUT | `/admin/assignments[/:slug]` | `{ trimesterId, slug, title, module?, summary?, description?, badge?, weekNumber, dueDayIndex (0-6), dueTime? ("HH:MM"), rubric: [{ criterion, points }], published? }` |

Lessons and quizzes share one `order` sequence for "up next" (quizzes default to `9999`, i.e. last). Request bodies for assignment submissions and these admin routes may be up to 256 KB (other LMS routes keep 16 KB).

## Seeds

- `npm run seed` (`src/seed.js`) is destructive and now **refuses to run when `NODE_ENV=production`** unless `ALLOW_DESTRUCTIVE_SEED=true` (then it waits 5 seconds). `seedLms()` has the same guard. The demo adds 3 lessons, the Module 4 quiz, 3 assignments (alice: one graded, one submitted), community posts and replies, lesson comments, a failed quiz attempt for alice, and alice's Trimester 1 certificate (`GLX-DEMO01`).
- `npm run seed:lms` (`scripts/seed-lms-content.js`) is **non-destructive**: it creates the Trimester, weeks, coding lab, lessons, quiz and assignments that are missing (natural keys: trimester name + program, week number, slugs) and leaves everything else alone. It creates no users or cohorts and deletes nothing. Env: `LMS_TRIMESTER_START` (`YYYY-MM-DD`, default next Monday), `LMS_TRIMESTER_NAME` (`Trimester 2`), `LMS_PROGRAM_NAME` (`Data Structures & Algorithms`). `-- --update` also refreshes lesson, quiz, assignment and lab content (never weeks, which would orphan students' progress). The coding lab slug is global, so a second trimester reuses the existing lab.

## Verification

`npm run test:lms-learning` (208 checks) against freshly seeded demo data. Re-seed before running it again or `npm run test:lms`, and restart the server between suites (the sign-in limiter allows 10 per 15 minutes per IP).
