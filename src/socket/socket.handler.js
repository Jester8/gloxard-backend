import { Server } from "socket.io";
import { verifyToken } from "../utils/jwt.js";
import { User } from "../models/User.model.js";
import { Conversation } from "../models/Conversation.model.js";
import { env } from "../config/env.js";

let io = null;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_ORIGINS && env.FRONTEND_ORIGINS.length > 0 ? env.FRONTEND_ORIGINS : "*",
      credentials: true,
    },
  });

  // Authentication Middleware
  io.use(async (socket, next) => {
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
  });

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
