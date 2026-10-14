# Specification: Unit 17 - Trimester LMS API (`/api/lms/*`)

All endpoints require `Authorization: Bearer <token>`. Errors use `{ "error": "<message>" }`; validation failures also include `"fields": { "<path>": "<message>" }`.

## Cohort context

Most endpoints act on one cohort. Send `?cohortId=<id>` (or `cohortId` in the body); if omitted, the user's most recent active cohort is used. `404` = not in any cohort, `403` = not a member of that cohort. Roles per cohort: `student`, `instructor` (the cohort's instructor), `admin`.

"Today" is evaluated in the programme timezone (`LMS_TZ_OFFSET_MINUTES`, default `60` = WAT).

## Student

| Method | Path | Notes |
|---|---|---|
| GET | `/me` | `{ cohorts: [{ _id, name, role, trimester }], activeCohortId }` |
| GET | `/dashboard` | `currentWeek`, `progress { overall, week, assignments {done,total}, attendance {attended,total,percent} }`, `upNext`, `upcoming[]`, `nextLiveSession`, `announcements[]` |
| GET | `/curriculum` | `{ currentWeek, weeks: [{ weekNumber, title, progress, estimatedHours }] }` |
| GET | `/curriculum/weeks/:weekNumber` | `week { objective, estimatedHours, concepts, progress, days[7] }`. Day: `{ day, dayIndex, date, status, module, title, progress, items[{ _id, kind, label, labSlug, done }] }`. `status`: `done` \| `today` \| `available` (past, unfinished) \| `upcoming` \| `locked` (nothing scheduled) |
| POST | `/progress` | `{ itemId, completed? }` students only; items on days that haven't started return `403` |
| GET | `/announcements` | paginated (`page`, `limit`) |
| POST | `/announcements` | instructor/admin: `{ title, text }` |

## Help Center

| Method | Path | Notes |
|---|---|---|
| POST | `/inquiries` | `{ category: academics\|technical\|billing, subject, description, attachments?: [{ key, name, size, mimeType }] }`. Upload files first with `POST /api/upload/presigned-url` (`folder: "documents"`); keys must belong to the caller. Max 5 files, SVG/PNG/JPG/PDF, 10 MB. Limit: 10 per hour |
| GET | `/inquiries` | your own, newest first (`status`, `page`, `limit`) |
| GET | `/inquiries/:id` | owner or admin; includes replies |

## Live classes

| Method | Path | Notes |
|---|---|---|
| GET | `/live-sessions` | cohort sessions (`status` filter); each has `canJoin` |
| GET | `/live-sessions/:id` | session + `polls[]` (counts and your `myVote`), `sharedCode`, `myHandRaised` |
| POST | `/live-sessions/:id/join` | records attendance. Returns `{ provider: "livekit", configured, serverUrl, roomToken, roomName, role, status }`. `configured: false` means LiveKit isn't set up, so show the preview room. Students can join 15 minutes before the start time; `409` otherwise |
| POST | `/live-sessions/:id/start` \| `/end` | instructor/admin |
| GET | `/live-sessions/:id/chat` | `?limit=50&before=<messageId>`, oldest first, `hasMore` |
| POST | `/live-sessions/:id/chat` | `{ text }`, only while live. Limit: 40 per minute |
| POST | `/live-sessions/:id/polls` | instructor/admin: `{ question, options: [2-6] }`, closes any open poll |
| POST | `/live-sessions/:id/polls/:pollId/vote` | `{ optionIndex }`; one vote, changing replaces it |
| POST | `/live-sessions/:id/polls/:pollId/close` | instructor/admin |
| POST | `/live-sessions/:id/hand` | `{ raised? }` toggles by default |
| GET | `/live-sessions/:id/people` | instructor + students with `joined`, `handRaised`, `isYou` |
| PUT | `/live-sessions/:id/shared-code` | instructor/admin: `{ language, content }` (100 KB max) |

### Realtime (`/live` Socket.io namespace)

Connect to `<backend>/live` with `auth: { token }`. Emit `join_session` with `{ sessionId }` (acknowledgement `{ ok, error? }`; members only). Events to listen for: `chat:new`, `poll:new`, `poll:update` (counts only, `myVote` is always `null` in broadcasts), `hand:update { userId, name, raised, count }`, `code:update { language, content, updatedAt }`, `session:status { sessionId, status, startedAt, endedAt }`.

### LiveKit

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Students get publish rights; instructors/admins are room admins. Token lifetime 2 hours.

## Coding labs

| Method | Path | Notes |
|---|---|---|
| GET | `/code-labs` | `[{ slug, title, module, estimate, submitted, best }]` |
| GET | `/code-labs/:slug` | steps, hints, files (including the read-only tests file) |
| POST | `/code-labs/:slug/submissions` | `{ files: [{ name, content }], passed, total }`. Only editable lab files, max 10 files of 100 KB. Results come from the browser runner and are stored with `verification: "unverified"` |
| GET | `/code-labs/:slug/submissions/me` | your last 10, newest first (use the newest to restore work on another device) |

Request bodies on code routes may be up to 1 MB; everything else is limited to 16 KB.

## Admin (`role: admin`)

`GET/POST /admin/trimesters`, `PUT /admin/trimesters/:id/weeks/:weekNumber` (creates or replaces a week; item ids are kept for items with the same day/kind/label so progress survives edits), `GET/POST /admin/cohorts`, `POST /admin/cohorts/:id/students` (`userIds` and/or `emails`), `DELETE /admin/cohorts/:id/students/:userId`, `POST /admin/live-sessions`, `POST /admin/live-sessions/:id/cancel`, `POST /admin/code-labs`, `PUT /admin/code-labs/:slug`, `GET /admin/inquiries`, `PUT /admin/inquiries/:id` (`status`, `reply`).

## Not included yet

Community forum, assignments and grading, a server-side code runner (submissions are unverified), trimester payment and enrolment, and the OpenAPI file.
