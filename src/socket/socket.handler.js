import { Server } from "socket.io";
import { verifyToken } from "../utils/jwt.js";
import { User } from "../models/User.model.js";
import { Conversation } from "../models/Conversation.model.js";
import { Cohort, LiveSession } from "../models/Lms.model.js";
import { env } from "../config/env.js";

let io = null;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_ORIGINS && env.FRONTEND_ORIGINS.length > 0 ? env.FRONTEND_ORIGINS : "*",
      credentials: true,
    },
  });

  // Authentication Middleware (shared by the default namespace and /live)
  const authenticate = async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token && socket.handshake.headers?.authorization) {
        token = socket.handshake.headers.authorization;
      }
      if (!token) {
        return next(new Error("Authentication error"));
      }
      if (typeof token === "string" && token.startsWith("Bearer ")) {
        token = token.slice(7).trim();
      }

      const decoded = verifyToken(token);
      const userId = decoded.sub || decoded._id || decoded.id;
      if (!userId) {
        return next(new Error("Authentication error"));
      }

      const user = await User.findById(userId).select("-password");
      if (!user || user.isActive === false) {
        return next(new Error("Authentication error"));
      }

      socket.user = {
        _id: user._id.toString(),
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      };

      next();
    } catch (err) {
      return next(new Error("Authentication error"));
    }
  };
  io.use(authenticate);

  initLiveNamespace(io, authenticate);

  io.on("connection", (socket) => {
    const userId = socket.user._id;
    socket.join(`user:${userId}`);

    // Join user room event
    // Users may only (re)join their own room; joining another user's room would
    // leak that user's private notifications.
    socket.on("join_user", (data) => {
      const targetId = data?.userId || userId;
      if (String(targetId) === userId) {
        socket.join(`user:${userId}`);
      }
    });

    // Join conversation room
    socket.on("join_conversation", async (data) => {
      try {
        const conversationId = typeof data === "string" ? data : data?.conversationId;
        if (!conversationId) return;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        const isParticipant = conversation.participants.some(
          (p) => p.toString() === userId
        );
        if (isParticipant) {
          socket.join(`conv:${conversationId}`);
        }
      } catch (err) {
        console.error("Socket join_conversation error:", err);
      }
    });

    // Leave conversation room
    socket.on("leave_conversation", (data) => {
      const conversationId = typeof data === "string" ? data : data?.conversationId;
      if (conversationId) {
        socket.leave(`conv:${conversationId}`);
      }
    });

    // Typing event
    socket.on("typing", (data) => {
      const conversationId = typeof data === "string" ? data : data?.conversationId;
      if (conversationId) {
        socket.to(`conv:${conversationId}`).emit("typing", {
          conversationId,
          userId: socket.user._id,
          user: socket.user,
        });
      }
    });

    // Stop typing event
    socket.on("stop_typing", (data) => {
      const conversationId = typeof data === "string" ? data : data?.conversationId;
      if (conversationId) {
        socket.to(`conv:${conversationId}`).emit("stop_typing", {
          conversationId,
          userId: socket.user._id,
          user: socket.user,
        });
      }
    });

    socket.on("disconnect", () => {
      // Disconnection handled automatically by socket.io
    });
  });

  return io;
};

let liveNamespace = null;

// Live class realtime channel: clients join a session room only if they belong to its cohort.
const initLiveNamespace = (server, authenticate) => {
  liveNamespace = server.of("/live");
  liveNamespace.use(authenticate);

  liveNamespace.on("connection", (socket) => {
    socket.on("join_session", async (data, ack) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        const sessionId = typeof data === "string" ? data : data?.sessionId;
        const session = sessionId ? await LiveSession.findById(sessionId).select("cohort") : null;
        if (!session) return reply({ ok: false, error: "Live session not found" });

        const cohort = await Cohort.findById(session.cohort).select("students instructor");
        const userId = socket.user._id;
        const allowed =
          socket.user.role === "admin" ||
          cohort?.instructor?.toString() === userId ||
          cohort?.students.some((id) => id.toString() === userId);
        if (!allowed) return reply({ ok: false, error: "You are not a member of this class" });

        socket.join(`live:${sessionId}`);
        reply({ ok: true });
      } catch (err) {
        console.error("Socket join_session error:", err);
        reply({ ok: false, error: "Could not join the session" });
      }
    });

    socket.on("leave_session", (data) => {
      const sessionId = typeof data === "string" ? data : data?.sessionId;
      if (sessionId) socket.leave(`live:${sessionId}`);
    });
  });
};

/** Broadcast an event to everyone in a live session room (chat:new, poll:new, poll:update, hand:update, code:update, session:status). */
export const emitLive = (sessionId, event, payload) => {
  if (liveNamespace) liveNamespace.to(`live:${sessionId}`).emit(event, payload);
};

export const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
};

export const emitNewMessage = (conversationId, messageData) => {
  if (io) {
    io.to(`conv:${conversationId}`).emit("new_message", messageData);
  }
};

export const emitNotification = (recipientId, notificationData) => {
  if (io) {
    io.to(`user:${recipientId}`).emit("new_notification", notificationData);
  }
};

export const broadcastNotification = (targetRole, notificationData) => {
  if (io) {
    io.emit("new_notification", notificationData);
  }
};
