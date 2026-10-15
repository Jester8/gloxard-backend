import mongoose from "mongoose";

const { Schema } = mongoose;
const ref = (model, extra = {}) => ({ type: Schema.Types.ObjectId, ref: model, ...extra });

const toJSON = {
  virtuals: false,
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
};

/* ---------- Trimester & cohort ---------- */
const trimesterSchema = new Schema(
  {
    name: { type: String, required: true, trim: true }, // "Trimester 2"
    programName: { type: String, required: true, trim: true }, // "Data Structures & Algorithms"
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    enrollmentOpensAt: { type: Date, default: null },
    enrollmentClosesAt: { type: Date, default: null },
    price: { type: Number, default: 0, min: 0 },
    currency: { type: String, enum: ["NGN", "USD"], default: "NGN" },
    status: { type: String, enum: ["draft", "open", "running", "ended"], default: "draft", index: true },
  },
  { timestamps: true, toJSON }
);

const cohortSchema = new Schema(
  {
    name: { type: String, required: true, trim: true }, // "Cohort B"
    trimester: ref("Trimester", { required: true, index: true }),
    instructor: ref("User", { default: null, index: true }),
    students: [ref("User")],
    // Monday of week 1; day/week unlocking is computed from this date
    startsAt: { type: Date, required: true },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
  },
  { timestamps: true, toJSON }
);
cohortSchema.index({ students: 1, status: 1 });

/* ---------- Weekly plan ---------- */
export const ITEM_KINDS = ["video", "reading", "code", "check", "live", "problems", "review", "submission"];

const dayItemSchema = new Schema(
  {
    kind: { type: String, enum: ITEM_KINDS, required: true },
    label: { type: String, required: true, trim: true },
    labSlug: { type: String, default: null }, // kind "code" can point at a coding lab
    lessonRef: { type: String, default: null }, // optional pointer to a lesson/module identifier
  },
  { _id: true }
);

const daySchema = new Schema(
  {
    dayIndex: { type: Number, min: 0, max: 6, required: true }, // 0 = Monday
    module: { type: String, default: "", trim: true }, // "Module 2.3" or "Assessment"
    title: { type: String, default: "", trim: true },
    items: [dayItemSchema],
  },
  { _id: false }
);

const weekSchema = new Schema(
  {
    trimester: ref("Trimester", { required: true, index: true }),
    weekNumber: { type: Number, required: true, min: 1 },
    objective: {
      title: { type: String, required: true, trim: true },
      text: { type: String, default: "", trim: true },
    },
    estimatedHours: { type: Number, default: 0, min: 0 },
    concepts: [{ type: String, trim: true }],
    days: [daySchema],
  },
  { timestamps: true, toJSON }
);
weekSchema.index({ trimester: 1, weekNumber: 1 }, { unique: true });

const progressSchema = new Schema(
  {
    user: ref("User", { required: true }),
    cohort: ref("Cohort", { required: true }),
    completedItems: [{ type: Schema.Types.ObjectId }],
  },
  { timestamps: true, toJSON }
);
progressSchema.index({ user: 1, cohort: 1 }, { unique: true });

const announcementSchema = new Schema(
  {
    cohort: ref("Cohort", { required: true, index: true }),
    author: ref("User", { required: true }),
    title: { type: String, required: true, trim: true, maxlength: 140 },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true, toJSON }
);

/* ---------- Inquiries (Help Center) ---------- */
export const INQUIRY_CATEGORIES = ["academics", "technical", "billing"];

const inquirySchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },
    user: ref("User", { required: true, index: true }),
    cohort: ref("Cohort", { default: null }),
    category: { type: String, enum: INQUIRY_CATEGORIES, required: true },
    subject: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
    attachments: [
      {
        key: { type: String, required: true },
        name: { type: String, required: true },
        size: { type: Number, default: 0 },
        mimeType: { type: String, default: "" },
        _id: false,
      },
    ],
    status: { type: String, enum: ["pending", "in_progress", "resolved"], default: "pending", index: true },
    replies: [
      {
        author: ref("User", { required: true }),
        message: { type: String, required: true, trim: true, maxlength: 2000 },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, toJSON }
);

/* ---------- Live classes ---------- */
const pollSchema = new Schema(
  {
    question: { type: String, required: true, trim: true, maxlength: 300 },
    options: [
      {
        text: { type: String, required: true, trim: true, maxlength: 120 },
        voters: [ref("User")],
      },
    ],
    isOpen: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const liveSessionSchema = new Schema(
  {
    cohort: ref("Cohort", { required: true, index: true }),
    title: { type: String, required: true, trim: true },
    instructor: ref("User", { required: true }),
    startsAt: { type: Date, required: true, index: true },
    endsAt: { type: Date, required: true },
    status: { type: String, enum: ["scheduled", "live", "ended", "cancelled"], default: "scheduled", index: true },
    youtubeVideoId: { type: String, default: "", trim: true },
    sharedCode: {
      language: { type: String, default: "javascript" },
      content: { type: String, default: "", maxlength: 100000 },
      updatedAt: { type: Date, default: null },
    },
    polls: [pollSchema],
    handsRaised: [ref("User")],
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON }
);

const liveMessageSchema = new Schema(
  {
    session: ref("LiveSession", { required: true, index: true }),
    author: ref("User", { default: null }),
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    system: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON }
);
liveMessageSchema.index({ session: 1, createdAt: 1 });

const liveAttendanceSchema = new Schema(
  {
    session: ref("LiveSession", { required: true }),
    user: ref("User", { required: true }),
    joinedAt: { type: Date, default: Date.now },
  },
  { toJSON }
);
liveAttendanceSchema.index({ session: 1, user: 1 }, { unique: true });

/* ---------- Coding labs ---------- */
const labFileSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    language: { type: String, enum: ["javascript", "python", "json", "html", "css"], default: "javascript" },
    content: { type: String, default: "", maxlength: 100000 },
    readOnly: { type: Boolean, default: false },
  },
  { _id: false }
);

const codeLabSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    trimester: ref("Trimester", { default: null }),
    title: { type: String, required: true, trim: true },
    module: { type: String, default: "", trim: true },
    estimate: { type: String, default: "" },
    steps: [{ type: String, trim: true }],
    hints: [{ type: String, trim: true }],
    files: [labFileSchema],
    published: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON }
);

const codeSubmissionSchema = new Schema(
  {
    user: ref("User", { required: true, index: true }),
    lab: ref("CodeLab", { required: true, index: true }),
    cohort: ref("Cohort", { default: null }),
    files: [{ name: { type: String, required: true }, content: { type: String, default: "", maxlength: 100000 }, _id: false }],
    // Results are reported by the browser runner; no server-side sandbox exists yet, so they are never treated as verified.
    reportedPassed: { type: Number, default: 0, min: 0 },
    reportedTotal: { type: Number, default: 0, min: 0 },
    verification: { type: String, enum: ["unverified", "verified"], default: "unverified" },
  },
  { timestamps: true, toJSON }
);

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

export const Trimester = model("Trimester", trimesterSchema);
export const Cohort = model("Cohort", cohortSchema);
export const LmsWeek = model("LmsWeek", weekSchema);
export const LmsProgress = model("LmsProgress", progressSchema);
export const LmsAnnouncement = model("LmsAnnouncement", announcementSchema);
export const Inquiry = model("Inquiry", inquirySchema);
export const LiveSession = model("LiveSession", liveSessionSchema);
export const LiveMessage = model("LiveMessage", liveMessageSchema);
export const LiveAttendance = model("LiveAttendance", liveAttendanceSchema);
export const CodeLab = model("CodeLab", codeLabSchema);
export const CodeSubmission = model("CodeSubmission", codeSubmissionSchema);
