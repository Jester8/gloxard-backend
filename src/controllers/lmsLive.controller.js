import mongoose from "mongoose";
import { Cohort, LiveAttendance, LiveMessage, LiveSession } from "../models/Lms.model.js";
import { User } from "../models/User.model.js";
import { createRoomToken } from "../utils/livekit.js";
import { emitLive } from "../socket/socket.handler.js";

const JOIN_EARLY_MS = 15 * 60 * 1000;
const isTeacher = (req) => req.cohortRole === "admin" || req.cohortRole === "instructor";
const fullName = (user) => (user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Member" : "Member");
const idOf = (value) => String(value?._id ?? value);

const canJoin = (session, req, now = new Date()) => {
  if (session.status === "ended" || session.status === "cancelled") return false;
  if (isTeacher(req)) return true;
  if (session.status === "live") return true;
  return session.status === "scheduled" && now >= new Date(session.startsAt.getTime() - JOIN_EARLY_MS) && now < session.endsAt;
};

const pollView = (poll, userId) => {
  const options = poll.options.map((option, index) => ({
    index,
    text: option.text,
    votes: option.voters.length,
  }));
  const myVote = poll.options.findIndex((option) => option.voters.some((voter) => idOf(voter) === String(userId)));
  return {
    _id: poll._id,
    question: poll.question,
    isOpen: poll.isOpen,
    options,
    totalVotes: options.reduce((sum, option) => sum + option.votes, 0),
    myVote: myVote === -1 ? null : myVote,
    createdAt: poll.createdAt,
  };
};

// Poll payload for broadcasts: counts only, never who voted (each client works out its own myVote)
const pollBroadcast = (poll) => pollView(poll, null);

const sessionView = (session, req, { detail = false } = {}) => {
  const instructor = session.instructor && typeof session.instructor === "object" && session.instructor.firstName !== undefined ? session.instructor : null;
  const view = {
    _id: session._id,
    cohort: session.cohort,
    title: session.title,
    instructor: instructor ? { _id: instructor._id, name: fullName(instructor) } : session.instructor,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    status: session.status,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    canJoin: canJoin(session, req),
    handsRaised: session.handsRaised.length,
  };
  if (detail) {
    view.sharedCode = session.sharedCode?.content ? session.sharedCode : null;
    view.polls = session.polls.map((poll) => pollView(poll, req.user._id));
    view.myHandRaised = session.handsRaised.some((id) => idOf(id) === String(req.user._id));
  }
  return view;
};

const messageView = (message) => ({
  _id: message._id,
  system: message.system,
  text: message.text,
  author: message.author && typeof message.author === "object" ? { _id: message.author._id, name: fullName(message.author) } : null,
  createdAt: message.createdAt,
});

/** GET /api/lms/live-sessions?cohortId=&status= */
export const listLiveSessionsController = async (req, res, next) => {
  try {
    const filter = { cohort: req.cohort._id };
    if (["scheduled", "live", "ended", "cancelled"].includes(req.query.status)) filter.status = req.query.status;
    const sessions = await LiveSession.find(filter).sort({ startsAt: req.query.status === "ended" ? -1 : 1 }).limit(50).populate("instructor", "firstName lastName username");
    return res.status(200).json({ sessions: sessions.map((session) => sessionView(session, req)) });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/live-sessions/:id */
export const getLiveSessionController = async (req, res, next) => {
  try {
    const session = await req.session_.populate("instructor", "firstName lastName username");
    return res.status(200).json({ session: sessionView(session, req, { detail: true }) });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/live-sessions/:id/join
 * Records attendance and returns the LiveKit connection details ({ provider, serverUrl, roomToken }).
 * `configured: false` means LiveKit isn't set up on this server, so the frontend shows its preview room.
 */
export const joinLiveSessionController = async (req, res, next) => {
  try {
    const session = req.session_;
    if (!canJoin(session, req)) {
      const message =
        session.status === "ended" ? "This class has ended" :
        session.status === "cancelled" ? "This class was cancelled" :
        "This class hasn't started yet. You can join 15 minutes before it begins.";
      return res.status(409).json({ error: message });
    }

    const roomName = session.roomName || `lms-${session._id}`;
    if (!session.roomName) {
      session.roomName = roomName;
      await session.save();
    }

    if (!isTeacher(req)) {
      await LiveAttendance.updateOne({ session: session._id, user: req.user._id }, { $setOnInsert: { joinedAt: new Date() } }, { upsert: true });
    }

    const connection = await createRoomToken({
      roomName,
      identity: String(req.user._id),
      name: fullName(req.user),
      isHost: isTeacher(req),
    });

    return res.status(200).json({ ...connection, role: req.cohortRole, status: session.status });
  } catch (error) {
    next(error);
  }
};

const setStatus = async (req, res, next, { from, to, message, patch }) => {
  try {
    const session = req.session_;
    if (!from.includes(session.status)) {
      return res.status(409).json({ error: `A ${session.status} class can't be changed this way` });
    }
    session.status = to;
    Object.assign(session, patch(session));
    await session.save();

    const system = await LiveMessage.create({ session: session._id, system: true, text: message });
    emitLive(session._id, "session:status", { sessionId: session._id, status: session.status, startedAt: session.startedAt, endedAt: session.endedAt });
    emitLive(session._id, "chat:new", messageView(system));
    return res.status(200).json({ message: message, session: sessionView(session, req) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/live-sessions/:id/start (instructor/admin) */
export const startLiveSessionController = (req, res, next) =>
  setStatus(req, res, next, {
    from: ["scheduled"],
    to: "live",
    message: "The class has started",
    patch: (session) => ({ startedAt: new Date(), roomName: session.roomName || `lms-${session._id}` }),
  });

/** POST /api/lms/live-sessions/:id/end (instructor/admin) */
export const endLiveSessionController = (req, res, next) =>
  setStatus(req, res, next, {
    from: ["live"],
    to: "ended",
    message: "The class has ended",
    patch: () => ({ endedAt: new Date(), handsRaised: [] }),
  });

/* ---------- Chat ---------- */

/** GET /api/lms/live-sessions/:id/chat?limit=50&before=<messageId> (oldest to newest) */
export const getChatController = async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const filter = { session: req.session_._id };
    if (req.query.before) {
      if (!mongoose.Types.ObjectId.isValid(req.query.before)) return res.status(400).json({ error: "Invalid message ID format" });
      filter._id = { $lt: req.query.before };
    }
    const messages = await LiveMessage.find(filter).sort({ _id: -1 }).limit(limit + 1).populate("author", "firstName lastName username");
    const hasMore = messages.length > limit;
    return res.status(200).json({ messages: messages.slice(0, limit).reverse().map(messageView), hasMore });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/live-sessions/:id/chat  { text } */
export const sendChatController = async (req, res, next) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "Message text is required", fields: { text: "Message text is required" } });
    if (text.length > 1000) return res.status(400).json({ error: "Messages can be up to 1000 characters", fields: { text: "Messages can be up to 1000 characters" } });
    if (req.session_.status !== "live") return res.status(409).json({ error: "Chat is only open while the class is live" });

    const message = await LiveMessage.create({ session: req.session_._id, author: req.user._id, text });
    await message.populate("author", "firstName lastName username");
    const payload = messageView(message);
    emitLive(req.session_._id, "chat:new", payload);
    return res.status(201).json({ message: payload });
  } catch (error) {
    next(error);
  }
};

/* ---------- Polls ---------- */

/** POST /api/lms/live-sessions/:id/polls  { question, options: ["..", ".."] } (instructor/admin) */
export const createPollController = async (req, res, next) => {
  try {
    const { question, options } = req.body || {};
    const fields = {};
    if (!question || !String(question).trim()) fields.question = "A question is required";
    const cleaned = Array.isArray(options) ? options.map((option) => String(option ?? "").trim()).filter(Boolean) : [];
    if (cleaned.length < 2 || cleaned.length > 6) fields.options = "Provide between 2 and 6 options";
    if (Object.keys(fields).length) return res.status(400).json({ error: Object.values(fields).join(", "), fields });
    if (req.session_.status !== "live") return res.status(409).json({ error: "Polls can only be launched while the class is live" });

    // Only one poll open at a time
    req.session_.polls.forEach((poll) => { poll.isOpen = false; });
    req.session_.polls.push({ question, options: cleaned.map((text) => ({ text, voters: [] })) });
    await req.session_.save();

    const poll = req.session_.polls[req.session_.polls.length - 1];
    const system = await LiveMessage.create({ session: req.session_._id, system: true, text: "Instructor launched a poll" });
    emitLive(req.session_._id, "poll:new", pollBroadcast(poll));
    emitLive(req.session_._id, "chat:new", messageView(system));
    return res.status(201).json({ poll: pollView(poll, req.user._id) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/live-sessions/:id/polls/:pollId/vote  { optionIndex } (changing your vote replaces it) */
export const votePollController = async (req, res, next) => {
  try {
    const poll = req.session_.polls.id(req.params.pollId);
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    if (!poll.isOpen) return res.status(409).json({ error: "This poll is closed" });

    const optionIndex = Number(req.body?.optionIndex);
    if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= poll.options.length) {
      return res.status(400).json({ error: "Choose one of the poll options", fields: { optionIndex: "Choose one of the poll options" } });
    }

    const userId = String(req.user._id);
    poll.options.forEach((option) => {
      option.voters = option.voters.filter((voter) => idOf(voter) !== userId);
    });
    poll.options[optionIndex].voters.push(req.user._id);
    await req.session_.save();

    emitLive(req.session_._id, "poll:update", pollBroadcast(poll));
    return res.status(200).json({ poll: pollView(poll, req.user._id) });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/live-sessions/:id/polls/:pollId/close (instructor/admin) */
export const closePollController = async (req, res, next) => {
  try {
    const poll = req.session_.polls.id(req.params.pollId);
    if (!poll) return res.status(404).json({ error: "Poll not found" });
    poll.isOpen = false;
    await req.session_.save();
    emitLive(req.session_._id, "poll:update", pollBroadcast(poll));
    return res.status(200).json({ poll: pollView(poll, req.user._id) });
  } catch (error) {
    next(error);
  }
};

/* ---------- Raise hand, people, shared code ---------- */

/** POST /api/lms/live-sessions/:id/hand  { raised?: boolean } (omit to toggle) */
export const toggleHandController = async (req, res, next) => {
  try {
    const session = req.session_;
    if (session.status !== "live") return res.status(409).json({ error: "You can raise your hand while the class is live" });

    const userId = String(req.user._id);
    const isRaised = session.handsRaised.some((id) => idOf(id) === userId);
    const raised = typeof req.body?.raised === "boolean" ? req.body.raised : !isRaised;

    if (raised && !isRaised) session.handsRaised.push(req.user._id);
    if (!raised && isRaised) session.handsRaised = session.handsRaised.filter((id) => idOf(id) !== userId);
    await session.save();

    emitLive(session._id, "hand:update", { userId, name: fullName(req.user), raised, count: session.handsRaised.length });
    return res.status(200).json({ raised, count: session.handsRaised.length });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/live-sessions/:id/people */
export const getPeopleController = async (req, res, next) => {
  try {
    const cohort = await Cohort.findById(req.session_.cohort).select("students instructor");
    const ids = [cohort.instructor, ...cohort.students].filter(Boolean);
    const [users, attendance] = await Promise.all([
      User.find({ _id: { $in: ids } }).select("firstName lastName username"),
      LiveAttendance.find({ session: req.session_._id }).select("user"),
    ]);
    const joined = new Set(attendance.map((entry) => String(entry.user)));
    const hands = new Set(req.session_.handsRaised.map(idOf));
    const byId = new Map(users.map((user) => [String(user._id), user]));

    const people = ids
      .map((id) => byId.get(String(id)))
      .filter(Boolean)
      .map((user) => ({
        _id: user._id,
        name: fullName(user),
        role: cohort.instructor && String(cohort.instructor) === String(user._id) ? "instructor" : "student",
        joined: joined.has(String(user._id)),
        handRaised: hands.has(String(user._id)),
        isYou: String(user._id) === String(req.user._id),
      }));
    return res.status(200).json({ people, total: people.length });
  } catch (error) {
    next(error);
  }
};

/** PUT /api/lms/live-sessions/:id/shared-code  { language, content } (instructor/admin) */
export const updateSharedCodeController = async (req, res, next) => {
  try {
    const { language = "javascript", content } = req.body || {};
    if (typeof content !== "string") return res.status(400).json({ error: "content must be text", fields: { content: "content must be text" } });
    if (content.length > 100000) return res.status(400).json({ error: "Shared code is too large (100KB max)", fields: { content: "Shared code is too large (100KB max)" } });
    if (!["javascript", "python", "json", "html", "css"].includes(language)) {
      return res.status(400).json({ error: "Unsupported language", fields: { language: "Unsupported language" } });
    }

    req.session_.sharedCode = { language, content, updatedAt: new Date() };
    await req.session_.save();
    emitLive(req.session_._id, "code:update", { language, content, updatedAt: req.session_.sharedCode.updatedAt });
    return res.status(200).json({ sharedCode: req.session_.sharedCode });
  } catch (error) {
    next(error);
  }
};
