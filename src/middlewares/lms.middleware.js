import mongoose from "mongoose";
import { Cohort, LiveSession } from "../models/Lms.model.js";

const roleIn = (cohort, user) => {
  if (user.role === "admin") return "admin";
  if (cohort.instructor && cohort.instructor.toString() === user._id.toString()) return "instructor";
  if (cohort.students.some((id) => id.toString() === user._id.toString())) return "student";
  return null;
};

/**
 * Resolves the cohort for LMS requests and checks membership.
 * Uses ?cohortId= (or body.cohortId) when given; otherwise the user's most recent active cohort.
 * Sets req.cohort and req.cohortRole ("student" | "instructor" | "admin").
 */
export const resolveCohort = async (req, res, next) => {
  try {
    const requested = req.query.cohortId || req.body?.cohortId;
    let cohort = null;

    if (requested) {
      if (!mongoose.Types.ObjectId.isValid(requested)) {
        return res.status(400).json({ error: "Invalid cohort ID format" });
      }
      cohort = await Cohort.findById(requested).populate("trimester");
      if (!cohort) return res.status(404).json({ error: "Cohort not found" });
    } else {
      const membership =
        req.user.role === "admin"
          ? {}
          : { $or: [{ students: req.user._id }, { instructor: req.user._id }] };
      cohort = await Cohort.findOne({ ...membership, status: "active" }).sort({ startsAt: -1 }).populate("trimester");
      if (!cohort) return res.status(404).json({ error: "You are not enrolled in a trimester cohort" });
    }

    const role = roleIn(cohort, req.user);
    if (!role) return res.status(403).json({ error: "You are not a member of this cohort" });

    req.cohort = cohort;
    req.cohortRole = role;
    next();
  } catch (error) {
    next(error);
  }
};

/** Loads :id as a live session, then applies the same membership check using the session's cohort. */
export const resolveLiveSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid session ID format" });

    const session = await LiveSession.findById(id);
    if (!session) return res.status(404).json({ error: "Live session not found" });

    const cohort = await Cohort.findById(session.cohort).populate("trimester");
    if (!cohort) return res.status(404).json({ error: "Cohort not found" });

    const role = roleIn(cohort, req.user);
    if (!role) return res.status(403).json({ error: "You are not a member of this class" });

    req.session_ = session; // `req.session` is reserved by session middleware conventions
    req.cohort = cohort;
    req.cohortRole = role;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireTeacher = (req, res, next) => {
  if (req.cohortRole === "admin" || req.cohortRole === "instructor") return next();
  return res.status(403).json({ error: "Only the instructor can do this" });
};
