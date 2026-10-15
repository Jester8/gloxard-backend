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
| POST | `/live-sessions/:id/join` | records attendance. Returns `{ provider: "youtube", configured, videoId, embedUrl, watchUrl, role, status }`. `configured: false` means no YouTube link has been added yet, so show a "stream starting soon" state. Students can join 15 minutes before the start time; `409` otherwise |
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

### YouTube live streaming

Classes stream on YouTube (create the broadcast in YouTube Studio; "Unlisted" works well). The instructor or an admin pastes the link with `PUT /live-sessions/:id/stream { youtubeUrl }` (watch, live, youtu.be or embed links all work; an empty value clears it), or passes `youtubeUrl` when scheduling via `POST /admin/live-sessions`. Members get the video from `POST /live-sessions/:id/join`, and a `session:stream` event is pushed on the `/live` socket when the link changes. Chat, polls, raised hands and shared code stay on this API.
