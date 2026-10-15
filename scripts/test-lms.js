// LMS API checks. Needs a running server and fresh seed data: npm run seed && npm start, then npm run test:lms
import "dotenv/config";
import { io } from "socket.io-client";

const PORT = process.env.PORT || 3001;
const BASE = `http://localhost:${PORT}`;
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

const waitFor = (socket, event, ms = 4000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
  });

const connectLive = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(`${BASE}/live`, { auth: { token }, transports: ["websocket"] });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (error) => reject(error));
  });

const emitAck = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

const main = async () => {
  const alice = await signin("alice.student@gloxad.com");
  const bob = await signin("bob.student@gloxad.com");
  const jane = await signin("jane.tutor@gloxad.com");
  const john = await signin("john.tutor@gloxad.com");
  const admin = await signin("admin@gloxad.com");

  console.log("\n-- auth & cohort access");
  ok((await call("GET", "/api/lms/me")).status === 401, "LMS requires sign-in");
  let r = await call("GET", "/api/lms/me", alice.token);
  ok(r.status === 200 && r.data.cohorts.length === 1 && r.data.cohorts[0].role === "student", "alice sees her cohort as student");
  const cohortId = r.data.activeCohortId;
  r = await call("GET", "/api/lms/me", jane.token);
  ok(r.data.cohorts[0]?.role === "instructor", "jane sees the cohort as instructor");
  r = await call("GET", "/api/lms/me", john.token);
  ok(r.status === 200 && r.data.cohorts.length === 0, "john (not in any cohort) has no cohorts");
  ok((await call("GET", "/api/lms/dashboard", john.token)).status === 404, "dashboard without a cohort -> 404");
  ok((await call("GET", `/api/lms/dashboard?cohortId=${cohortId}`, john.token)).status === 403, "non-member with a cohortId -> 403");
  ok((await call("GET", "/api/lms/dashboard?cohortId=nope", alice.token)).status === 400, "bad cohortId -> 400");

  console.log("\n-- dashboard & curriculum");
  r = await call("GET", "/api/lms/dashboard", alice.token);
  ok(r.status === 200 && r.data.currentWeek === 2, "dashboard: current week is 2", JSON.stringify(r.data).slice(0, 120));
  ok(r.data.progress.overall === 25, "dashboard: overall progress 25% (9 of 36 items)", String(r.data.progress?.overall));
  ok(r.data.progress.attendance.percent === 100, "dashboard: attendance 100%");
  ok(r.data.announcements.length === 2 && r.data.nextLiveSession, "dashboard: announcements and next live session");
  ok(r.data.upNext && r.data.upcoming.length > 0, "dashboard: up next and upcoming activities");
  r = await call("GET", "/api/lms/curriculum", alice.token);
  ok(r.data.weeks.length === 4 && r.data.weeks[0].progress === 100 && r.data.weeks[1].progress === 0, "curriculum: 4 weeks, week 1 complete");
  r = await call("GET", "/api/lms/curriculum/weeks/2", alice.token);
  const week = r.data.week;
  ok(r.status === 200 && week.days.length === 7 && week.objective.title.includes("Graph Theory"), "week 2: objective and 7 day slots");
  ok(week.days[5].status === "locked" && week.days[6].status === "locked", "week 2: Saturday and Sunday are locked");
  const todayIndex = (new Date(Date.now() + 60 * 60 * 1000).getUTCDay() + 6) % 7;
  if (todayIndex <= 4) {
    ok(week.days[todayIndex].status === "today", `week 2: ${week.days[todayIndex].day} is marked today`, week.days[todayIndex].status);
    if (todayIndex < 4) ok(week.days[todayIndex + 1].status === "upcoming", "week 2: tomorrow is upcoming");
  } else {
    ok(week.days[4].status === "available", "week 2: weekend, Friday is available (past)");
  }
  ok((await call("GET", "/api/lms/curriculum/weeks/9", alice.token)).status === 404, "unknown week -> 404");
  ok((await call("GET", "/api/lms/curriculum/weeks/abc", alice.token)).status === 400, "bad week number -> 400");

  console.log("\n-- progress");
  const mondayItem = week.days[0].items[0]._id;
  r = await call("POST", "/api/lms/progress", alice.token, { itemId: mondayItem });
  ok(r.status === 200 && r.data.completed && r.data.weekProgress > 0, "complete a past item", JSON.stringify(r.data).slice(0, 100));
  r = await call("GET", "/api/lms/curriculum/weeks/2", alice.token);
  ok(r.data.week.days[0].items[0].done === true, "item shows as done afterwards");
  r = await call("POST", "/api/lms/progress", alice.token, { itemId: mondayItem, completed: false });
  ok(r.status === 200 && r.data.completed === false, "undo an item");
  const week3 = (await call("GET", "/api/lms/curriculum/weeks/3", alice.token)).data.week;
  ok((await call("POST", "/api/lms/progress", alice.token, { itemId: week3.days[0].items[0]._id })).status === 403, "cannot complete a future item");
  ok((await call("POST", "/api/lms/progress", alice.token, { itemId: "000000000000000000000000" })).status === 404, "unknown item -> 404");
  ok((await call("POST", "/api/lms/progress", alice.token, {})).status === 400, "missing itemId -> 400");
  ok((await call("POST", "/api/lms/progress", jane.token, { itemId: mondayItem })).status === 403, "instructors don't track progress");

  console.log("\n-- announcements");
  ok((await call("GET", "/api/lms/announcements", alice.token)).data.total === 2, "students read announcements");
  ok((await call("POST", "/api/lms/announcements", alice.token, { title: "x", text: "y" })).status === 403, "students can't post announcements");
  r = await call("POST", "/api/lms/announcements", jane.token, { title: "Lab tomorrow", text: "Bring your laptops." });
  ok(r.status === 201 && r.data.announcement.author.firstName, "instructor posts an announcement");
  r = await call("POST", "/api/lms/announcements", jane.token, { title: "" });
  ok(r.status === 400 && r.data.fields.title && r.data.fields.text, "announcement validation returns fields");

  console.log("\n-- inquiries");
  r = await call("POST", "/api/lms/inquiries", alice.token, { category: "technical", subject: "Video will not load", description: "The lesson video spins forever on my phone." });
  ok(r.status === 201 && /^INQ-\d{4}-[0-9A-F]{6}$/.test(r.data.inquiry.reference) && r.data.inquiry.status === "pending", "create an inquiry", JSON.stringify(r.data).slice(0, 120));
  const inquiryId = r.data.inquiry._id;
  r = await call("POST", "/api/lms/inquiries", alice.token, { category: "x", subject: "a", description: "short" });
  ok(r.status === 400 && r.data.fields.category && r.data.fields.subject && r.data.fields.description, "inquiry validation returns every field error");
  r = await call("POST", "/api/lms/inquiries", alice.token, { category: "billing", subject: "Receipt", description: "Please send my receipt.", attachments: [{ key: `documents/${bob.id}/a.pdf`, name: "a.pdf" }] });
  ok(r.status === 400 && r.data.fields.attachments, "can't attach someone else's file");
  r = await call("POST", "/api/lms/inquiries", alice.token, { category: "billing", subject: "Receipt", description: "Please send my receipt.", attachments: [{ key: `documents/${alice.id}/a.pdf`, name: "a.pdf", size: 1000, mimeType: "application/pdf" }] });
  ok(r.status === 201 && r.data.inquiry.attachments.length === 1, "attach your own uploaded file");
  r = await call("POST", "/api/lms/inquiries", alice.token, { category: "billing", subject: "Receipt", description: "Please send my receipt.", attachments: [{ key: `documents/${alice.id}/a.exe`, name: "a.exe", mimeType: "application/x-msdownload" }] });
  ok(r.status === 400, "disallowed file type is rejected");
  r = await call("GET", "/api/lms/inquiries", alice.token);
  ok(r.status === 200 && r.data.total === 5 && !r.data.inquiries[0].description, "list my inquiries (no body in the list)", String(r.data.total));
  ok((await call("GET", "/api/lms/inquiries", john.token)).data.total === 0, "others see only their own inquiries");
  ok((await call("GET", `/api/lms/inquiries/${inquiryId}`, alice.token)).status === 200, "owner can open an inquiry");
  ok((await call("GET", `/api/lms/inquiries/${inquiryId}`, bob.token)).status === 403, "another student can't open it");
  ok((await call("GET", "/api/lms/inquiries/zzz", alice.token)).status === 400, "bad inquiry id -> 400");
  ok((await call("PUT", `/api/lms/admin/inquiries/${inquiryId}`, alice.token, { status: "resolved" })).status === 403, "students can't use admin routes");
  r = await call("PUT", `/api/lms/admin/inquiries/${inquiryId}`, admin.token, { status: "in_progress", reply: "We're looking into it." });
  ok(r.status === 200 && r.data.inquiry.status === "in_progress" && r.data.inquiry.replies.length === 1, "admin replies and changes status");
  ok((await call("PUT", `/api/lms/admin/inquiries/${inquiryId}`, admin.token, { status: "bogus" })).status === 400, "invalid status rejected");
  ok((await call("GET", "/api/lms/admin/inquiries?status=pending", admin.token)).data.total >= 1, "admin lists inquiries");

  console.log("\n-- live classes");
  r = await call("GET", "/api/lms/live-sessions", alice.token);
  const sessions = r.data.sessions;
  const live = sessions.find((s) => s.status === "live");
  const scheduled = sessions.find((s) => s.status === "scheduled");
  const ended = sessions.find((s) => s.status === "ended");
  ok(r.status === 200 && sessions.length === 3 && live && scheduled && ended, "list sessions: live, scheduled and ended");
  ok(live.canJoin === true && scheduled.canJoin === false && ended.canJoin === false, "canJoin reflects the status/time window");
  r = await call("GET", `/api/lms/live-sessions/${live._id}`, alice.token);
  ok(r.status === 200 && r.data.session.polls.length === 1 && r.data.session.polls[0].myVote === null && r.data.session.sharedCode.content.includes("function bfs"), "session detail has poll and shared code");
  ok((await call("GET", `/api/lms/live-sessions/${live._id}`, john.token)).status === 403, "non-member can't open a session");
  r = await call("POST", `/api/lms/live-sessions/${live._id}/join`, alice.token);
  ok(r.status === 200 && r.data.provider === "youtube" && r.data.configured === false && r.data.videoId === null, "join before a YouTube link is set: configured false", JSON.stringify(r.data));
  r = await call("PUT", `/api/lms/live-sessions/${live._id}/stream`, alice.token, { youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  ok(r.status === 403, "a student can't set the stream link");
  r = await call("PUT", `/api/lms/live-sessions/${live._id}/stream`, jane.token, { youtubeUrl: "https://example.com/video" });
  ok(r.status === 400 && r.data.fields?.youtubeUrl, "rejects a non-YouTube link");
  r = await call("PUT", `/api/lms/live-sessions/${live._id}/stream`, jane.token, { youtubeUrl: "https://youtu.be/dQw4w9WgXcQ?t=5" });
  ok(r.status === 200 && r.data.stream.videoId === "dQw4w9WgXcQ", "instructor saves a YouTube link (youtu.be form)", JSON.stringify(r.data));
  r = await call("POST", `/api/lms/live-sessions/${live._id}/join`, alice.token);
  ok(r.status === 200 && r.data.provider === "youtube" && r.data.configured === true && r.data.videoId === "dQw4w9WgXcQ" && r.data.embedUrl.includes("/embed/dQw4w9WgXcQ"), "join returns the YouTube embed details", JSON.stringify(r.data));
  ok((await call("POST", `/api/lms/live-sessions/${scheduled._id}/join`, alice.token)).status === 409, "can't join a class that is far from starting");
  ok((await call("POST", `/api/lms/live-sessions/${ended._id}/join`, alice.token)).status === 409, "can't join an ended class");
  r = await call("GET", `/api/lms/live-sessions/${live._id}/people`, alice.token);
  ok(r.status === 200 && r.data.total === 3 && r.data.people.find((p) => p.isYou)?.joined === true, "people list shows who joined");

  const { parseYouTubeId } = await import("../src/utils/youtube.js");
  ok(
    parseYouTubeId("https://www.youtube.com/live/abcDEF12345?feature=share") === "abcDEF12345" &&
      parseYouTubeId("youtube.com/embed/abcDEF12345") === "abcDEF12345" &&
      parseYouTubeId("abcDEF12345") === "abcDEF12345" &&
      parseYouTubeId("https://youtube.com.evil.io/watch?v=abcDEF12345") === null &&
      parseYouTubeId("not a link") === null,
    "YouTube link parsing accepts real forms and rejects look-alikes"
  );

  console.log("\n-- live chat, polls, hand, shared code (with realtime events)");
  const aliceSocket = await connectLive(alice.token);
  const johnSocket = await connectLive(john.token);
  ok((await emitAck(aliceSocket, "join_session", { sessionId: live._id })).ok === true, "member joins the realtime room");
  ok((await emitAck(johnSocket, "join_session", { sessionId: live._id })).ok === false, "non-member is refused the realtime room");
  let rejected = false;
  await new Promise((resolve) => { const bad = io(`${BASE}/live`, { transports: ["websocket"] }); bad.on("connect_error", () => { rejected = true; bad.close(); resolve(); }); });
  ok(rejected, "unauthenticated socket is rejected");

  r = await call("GET", `/api/lms/live-sessions/${live._id}/chat`, alice.token);
  ok(r.status === 200 && r.data.messages.length === 3 && r.data.messages[2].system, "chat history, oldest first", String(r.data.messages?.length));
  let pending = waitFor(aliceSocket, "chat:new");
  r = await call("POST", `/api/lms/live-sessions/${live._id}/chat`, bob.token, { text: "Thanks, that helps!" });
  const chatEvent = await pending;
  ok(r.status === 201 && chatEvent?.text === "Thanks, that helps!" && chatEvent.author.name.includes("Bob"), "sending chat broadcasts chat:new");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/chat`, bob.token, { text: "   " })).status === 400, "empty chat rejected");
  ok((await call("POST", `/api/lms/live-sessions/${scheduled._id}/chat`, bob.token, { text: "hi" })).status === 409, "chat is closed before the class is live");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/chat`, john.token, { text: "hi" })).status === 403, "non-member can't chat");

  const pollId = (await call("GET", `/api/lms/live-sessions/${live._id}`, alice.token)).data.session.polls[0]._id;
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/polls`, alice.token, { question: "Q?", options: ["a", "b"] })).status === 403, "students can't launch polls");
  r = await call("POST", `/api/lms/live-sessions/${live._id}/polls`, jane.token, { question: "Q?", options: ["only one"] });
  ok(r.status === 400 && r.data.fields.options, "poll needs 2-6 options");
  pending = waitFor(aliceSocket, "poll:new");
  r = await call("POST", `/api/lms/live-sessions/${live._id}/polls`, jane.token, { question: "Which traversal uses a queue?", options: ["BFS", "DFS", "Both"] });
  const newPoll = r.data.poll;
  ok(r.status === 201 && (await pending)?.question === "Which traversal uses a queue?", "launching a poll broadcasts poll:new");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/polls/${pollId}/vote`, alice.token, { optionIndex: 1 })).status === 409, "the earlier poll was closed when a new one launched");
  pending = waitFor(aliceSocket, "poll:update");
  r = await call("POST", `/api/lms/live-sessions/${live._id}/polls/${newPoll._id}/vote`, bob.token, { optionIndex: 0 });
  const update = await pending;
  ok(r.status === 200 && r.data.poll.myVote === 0 && update?.totalVotes === 1 && update.myVote === null, "voting broadcasts counts only (no voter identity)", JSON.stringify(update));
  r = await call("POST", `/api/lms/live-sessions/${live._id}/polls/${newPoll._id}/vote`, bob.token, { optionIndex: 2 });
  ok(r.data.poll.totalVotes === 1 && r.data.poll.myVote === 2 && r.data.poll.options[0].votes === 0, "changing a vote moves it (still one vote)");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/polls/${newPoll._id}/vote`, bob.token, { optionIndex: 9 })).status === 400, "invalid option rejected");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/polls/${newPoll._id}/close`, alice.token)).status === 403, "students can't close polls");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/polls/${newPoll._id}/close`, jane.token)).data.poll.isOpen === false, "instructor closes the poll");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/polls/${newPoll._id}/vote`, alice.token, { optionIndex: 0 })).status === 409, "can't vote on a closed poll");

  pending = waitFor(aliceSocket, "hand:update");
  r = await call("POST", `/api/lms/live-sessions/${live._id}/hand`, bob.token);
  const hand = await pending;
  ok(r.data.raised === true && r.data.count === 1 && hand?.raised === true, "raise hand broadcasts hand:update");
  r = await call("GET", `/api/lms/live-sessions/${live._id}/people`, jane.token);
  ok(r.data.people.find((p) => p.name.includes("Bob"))?.handRaised === true, "people list shows raised hands");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/hand`, bob.token)).data.raised === false, "toggling lowers the hand");
  ok((await call("POST", `/api/lms/live-sessions/${scheduled._id}/hand`, bob.token)).status === 409, "can't raise a hand before the class is live");

  ok((await call("PUT", `/api/lms/live-sessions/${live._id}/shared-code`, alice.token, { content: "x" })).status === 403, "students can't share code");
  pending = waitFor(aliceSocket, "code:update");
  r = await call("PUT", `/api/lms/live-sessions/${live._id}/shared-code`, jane.token, { language: "javascript", content: "console.log('live')" });
  ok(r.status === 200 && (await pending)?.content === "console.log('live')", "shared code update broadcasts code:update");
  ok((await call("PUT", `/api/lms/live-sessions/${live._id}/shared-code`, jane.token, { content: 5 })).status === 400, "shared code must be text");

  console.log("\n-- start / end");
  ok((await call("POST", `/api/lms/live-sessions/${scheduled._id}/start`, alice.token)).status === 403, "students can't start a class");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/start`, jane.token)).status === 409, "can't start a class that's already live");
  r = await call("POST", `/api/lms/live-sessions/${scheduled._id}/start`, jane.token);
  ok(r.status === 200 && r.data.session.status === "live", "instructor starts a scheduled class");
  pending = waitFor(aliceSocket, "session:status");
  await emitAck(aliceSocket, "join_session", { sessionId: live._id });
  r = await call("POST", `/api/lms/live-sessions/${live._id}/end`, jane.token);
  ok(r.status === 200 && (await pending)?.status === "ended", "ending a class broadcasts session:status");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/chat`, bob.token, { text: "after" })).status === 409, "chat closes when the class ends");
  ok((await call("POST", `/api/lms/live-sessions/${live._id}/join`, bob.token)).status === 409, "can't join after it ended");
  aliceSocket.close(); johnSocket.close();

  console.log("\n-- coding labs");
  r = await call("GET", "/api/lms/code-labs", alice.token);
  ok(r.status === 200 && r.data.labs.length === 1 && r.data.labs[0].submitted === false, "list labs");
  r = await call("GET", "/api/lms/code-labs/graph-representations", alice.token);
  ok(r.status === 200 && r.data.lab.files.length === 2 && r.data.lab.files[1].readOnly, "lab detail has starter files and the read-only tests");
  ok((await call("GET", "/api/lms/code-labs/nope", alice.token)).status === 404, "unknown lab -> 404");
  const good = [{ name: "graph.js", content: "function bfs(){}" }];
  r = await call("POST", "/api/lms/code-labs/graph-representations/submissions", alice.token, { files: good, passed: 3, total: 4 });
  ok(r.status === 201 && r.data.submission.verification === "unverified", "submission is saved as unverified");
  ok((await call("POST", "/api/lms/code-labs/graph-representations/submissions", alice.token, { files: [{ name: "tests.js", content: "x" }], passed: 4, total: 4 })).status === 400, "can't submit the read-only tests file");
  ok((await call("POST", "/api/lms/code-labs/graph-representations/submissions", alice.token, { files: good, passed: 5, total: 4 })).status === 400, "passed can't exceed total");
  ok((await call("POST", "/api/lms/code-labs/graph-representations/submissions", alice.token, { files: [{ name: "graph.js", content: "x".repeat(100001) }], passed: 1, total: 4 })).status === 400, "oversized files rejected");
  await call("POST", "/api/lms/code-labs/graph-representations/submissions", alice.token, { files: good, passed: 4, total: 4 });
  r = await call("GET", "/api/lms/code-labs", alice.token);
  ok(r.data.labs[0].submitted && r.data.labs[0].best.passed === 4, "list shows your best result");
  r = await call("GET", "/api/lms/code-labs/graph-representations/submissions/me", alice.token);
  ok(r.data.submissions.length === 2 && r.data.submissions[0].files[0].content, "my submissions, newest first");
  ok((await call("GET", "/api/lms/code-labs/graph-representations/submissions/me", bob.token)).data.submissions.length === 0, "submissions are private to their author");

  console.log("\n-- admin setup");
  ok((await call("POST", "/api/lms/admin/trimesters", jane.token, {})).status === 403, "instructors can't create trimesters");
  r = await call("POST", "/api/lms/admin/trimesters", admin.token, { name: "Trimester 3", programName: "Web Engineering", startsAt: "2027-01-04", endsAt: "2027-03-26", price: 100, currency: "USD" });
  ok(r.status === 201, "admin creates a trimester");
  const trimesterId = r.data.trimester._id;
  ok((await call("POST", "/api/lms/admin/trimesters", admin.token, { name: "T", programName: "P", startsAt: "2027-02-01", endsAt: "2027-01-01" })).status === 400, "end before start rejected");
  ok((await call("POST", "/api/lms/admin/trimesters", admin.token, { programName: "P", startsAt: "2027-01-01", endsAt: "2027-02-01" })).data.fields?.name, "missing name returns a field error");
  const weekBody = { objective: { title: "HTTP & REST", text: "Learn it." }, estimatedHours: 8, concepts: ["HTTP"], days: [{ dayIndex: 0, module: "Module 1.1", title: "HTTP basics", items: [{ kind: "video", label: "30m Video" }, { kind: "reading", label: "Reading" }] }] };
  r = await call("PUT", `/api/lms/admin/trimesters/${trimesterId}/weeks/1`, admin.token, weekBody);
  ok(r.status === 201, "admin creates week 1");
  const firstIds = r.data.week.days[0].items.map((item) => item._id);
  r = await call("PUT", `/api/lms/admin/trimesters/${trimesterId}/weeks/1`, admin.token, { ...weekBody, days: [{ ...weekBody.days[0], items: [...weekBody.days[0].items, { kind: "code", label: "Lab" }] }] });
  ok(r.status === 200 && r.data.week.days[0].items.slice(0, 2).every((item, index) => item._id === firstIds[index]) && r.data.week.days[0].items.length === 3, "editing a week keeps existing item ids (progress survives)");
  ok((await call("PUT", `/api/lms/admin/trimesters/${trimesterId}/weeks/1`, admin.token, { ...weekBody, days: [{ dayIndex: 9, title: "x", items: [] }] })).status === 400, "invalid day index rejected");
  r = await call("POST", "/api/lms/admin/cohorts", admin.token, { name: "Cohort C", trimesterId, instructorId: jane.id, startsAt: "2027-01-04" });
  ok(r.status === 201, "admin creates a cohort");
  const newCohort = r.data.cohort._id;
  r = await call("POST", `/api/lms/admin/cohorts/${newCohort}/students`, admin.token, { emails: ["bob.student@gloxad.com", "ghost@example.com"], userIds: [alice.id] });
  ok(r.status === 200 && r.data.studentCount === 2 && r.data.emailsNotFound[0] === "ghost@example.com", "add students by id and email; unknown emails reported");
  r = await call("GET", "/api/lms/me", bob.token);
  ok(r.data.cohorts.length === 2, "bob now belongs to two cohorts");
  ok((await call("GET", `/api/lms/curriculum/weeks/1?cohortId=${newCohort}`, bob.token)).data.week.objective.title === "HTTP & REST", "cohortId selects which cohort's plan to read");
  ok((await call("DELETE", `/api/lms/admin/cohorts/${newCohort}/students/${bob.id}`, admin.token)).data.studentCount === 1, "remove a student");
  ok((await call("GET", `/api/lms/curriculum?cohortId=${newCohort}`, bob.token)).status === 403, "removed student loses access");
  r = await call("POST", "/api/lms/admin/live-sessions", admin.token, { cohortId: newCohort, title: "Kickoff", startsAt: "2027-01-04T10:00:00Z", endsAt: "2027-01-04T12:00:00Z" });
  ok(r.status === 201 && r.data.session.status === "scheduled", "admin schedules a live session (instructor defaults to the cohort's)");
  ok((await call("POST", `/api/lms/admin/live-sessions/${r.data.session._id}/cancel`, admin.token)).data.session.status === "cancelled", "admin cancels it");
  ok((await call("POST", "/api/lms/admin/live-sessions", admin.token, { cohortId: newCohort, title: "Bad", startsAt: "2027-01-04T12:00:00Z", endsAt: "2027-01-04T10:00:00Z" })).status === 400, "end before start rejected for sessions");
  r = await call("POST", "/api/lms/admin/code-labs", admin.token, { slug: "http-basics", title: "HTTP Basics", files: [{ name: "main.js", content: "// go" }] });
  ok(r.status === 201, "admin creates a coding lab");
  ok((await call("POST", "/api/lms/admin/code-labs", admin.token, { slug: "http-basics", title: "Dup", files: [{ name: "a.js" }] })).data.fields?.slug, "duplicate slug returns a field error");
  ok((await call("PUT", "/api/lms/admin/code-labs/http-basics", admin.token, { title: "HTTP Basics 2", slug: "hack" })).data.lab.slug === "http-basics", "updating a lab ignores the slug field");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch((error) => {
  console.error("\nTest run crashed:", error);
  process.exit(1);
});
