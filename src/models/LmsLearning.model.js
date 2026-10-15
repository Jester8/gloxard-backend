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

const slugField = { type: String, required: true, lowercase: true, trim: true, match: /^[a-z0-9][a-z0-9-]*$/ };

/* ---------- Lessons ---------- */
const lessonSchema = new Schema(
  {
    trimester: ref("Trimester", { required: true, index: true }),
    slug: slugField,
    module: { type: String, default: "", trim: true }, // "Module 4: Advanced Systems"
    title: { type: String, required: true, trim: true, maxlength: 200 },
    order: { type: Number, default: 0 },
    videoId: { type: String, default: "", trim: true }, // 11-character YouTube id
    durationMinutes: { type: Number, default: null, min: 0 },
    intro: { type: String, default: "", maxlength: 5000 },
    objectives: [{ type: String, trim: true, maxlength: 300 }],
    concepts: [{ title: { type: String, required: true, trim: true }, text: { type: String, default: "" }, _id: false }],
    tip: { type: String, default: "", maxlength: 2000 },
    outro: { type: String, default: "", maxlength: 2000 },
    file: {
      name: { type: String, default: "" },
      sizeLabel: { type: String, default: "" },
      key: { type: String, default: "" },
    },
    published: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON }
);
lessonSchema.index({ trimester: 1, slug: 1 }, { unique: true });

const lessonProgressSchema = new Schema(
  {
    user: ref("User", { required: true }),
    cohort: ref("Cohort", { required: true }),
    lesson: ref("Lesson", { required: true }),
    doneObjectives: [{ type: Number, min: 0 }],
  },
  { timestamps: true, toJSON }
);
lessonProgressSchema.index({ user: 1, cohort: 1, lesson: 1 }, { unique: true });

const lessonCommentSchema = new Schema(
  {
    lesson: ref("Lesson", { required: true }),
    cohort: ref("Cohort", { required: true }),
    author: ref("User", { required: true }),
    parent: ref("LessonComment", { default: null }),
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    likes: [ref("User")],
  },
  { timestamps: true, toJSON }
);
lessonCommentSchema.index({ lesson: 1, cohort: 1, createdAt: -1 });

/* ---------- Quizzes ---------- */
const questionSchema = new Schema(
  {
    prompt: { type: String, required: true, trim: true, maxlength: 1000 },
    hint: { type: String, default: "", trim: true, maxlength: 500 },
    options: {
      type: [{ type: String, required: true, trim: true, maxlength: 500 }],
      validate: { validator: (value) => value.length >= 2 && value.length <= 6, message: "A question needs 2 to 6 options" },
    },
    answer: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const quizSchema = new Schema(
  {
    trimester: ref("Trimester", { required: true, index: true }),
    slug: slugField,
    course: { type: String, default: "", trim: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    module: { type: String, default: "", trim: true },
    order: { type: Number, default: 9999 }, // lessons and quizzes share one ordering for "up next"
    minutes: { type: Number, default: 15, min: 1 },
    passMark: { type: Number, default: 70, min: 1, max: 100 },
    questions: [questionSchema],
    published: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON }
);
quizSchema.index({ trimester: 1, slug: 1 }, { unique: true });

const quizAttemptSchema = new Schema(
  {
    user: ref("User", { required: true }),
    cohort: ref("Cohort", { required: true }),
    quiz: ref("LmsQuiz", { required: true }),
    answers: [{ type: Number, default: null }],
    score: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    passed: { type: Boolean, required: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { toJSON }
);
quizAttemptSchema.index({ user: 1, cohort: 1, quiz: 1, submittedAt: -1 });

/* ---------- Assignments ---------- */
const assignmentSchema = new Schema(
  {
    trimester: ref("Trimester", { required: true, index: true }),
    slug: slugField,
    module: { type: String, default: "", trim: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    summary: { type: String, default: "", trim: true, maxlength: 500 },
    description: { type: String, default: "", maxlength: 10000 },
    badge: { type: String, default: "", trim: true },
    weekNumber: { type: Number, required: true, min: 1 },
    dueDayIndex: { type: Number, required: true, min: 0, max: 6 },
    dueTime: { type: String, default: "23:59", match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    rubric: [{ criterion: { type: String, required: true, trim: true }, points: { type: Number, required: true, min: 0 }, _id: false }],
    published: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON }
);
assignmentSchema.index({ trimester: 1, slug: 1 }, { unique: true });

const submissionSchema = new Schema(
  {
    user: ref("User", { required: true }),
    cohort: ref("Cohort", { required: true }),
    assignment: ref("Assignment", { required: true }),
    text: { type: String, default: "", maxlength: 20000 },
    links: [{ type: String, trim: true, maxlength: 500 }],
    attachments: [
      {
        key: { type: String, required: true },
        name: { type: String, required: true },
        size: { type: Number, default: 0 },
        mimeType: { type: String, default: "" },
        _id: false,
      },
    ],
    status: { type: String, enum: ["submitted", "graded"], default: "submitted", index: true },
    score: { type: Number, default: null, min: 0 },
    feedback: { type: String, default: "", maxlength: 5000 },
    rubricScores: [{ criterion: String, points: Number, _id: false }],
    gradedBy: ref("User", { default: null }),
    gradedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: Date.now },
    late: { type: Boolean, default: false },
  },
  { timestamps: true, toJSON }
);
submissionSchema.index({ user: 1, cohort: 1, assignment: 1 }, { unique: true });
submissionSchema.index({ cohort: 1, status: 1, submittedAt: 1 });

/* ---------- Community ---------- */
export const COMMUNITY_CHANNELS = [
  { id: "general", label: "General" },
  { id: "qa", label: "Q&A" },
  { id: "showcase", label: "Project Showcase" },
  { id: "study", label: "Study Groups" },
];

const postSchema = new Schema(
  {
    cohort: ref("Cohort", { required: true }),
    author: ref("User", { required: true }),
    channel: { type: String, enum: COMMUNITY_CHANNELS.map((channel) => channel.id), required: true },
    tag: { type: String, default: "Discussion", trim: true, maxlength: 30 },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, required: true, trim: true, maxlength: 5000 },
    likes: [ref("User")],
    pinned: { type: Boolean, default: false },
    replyCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, toJSON }
);
postSchema.index({ cohort: 1, channel: 1, pinned: -1, createdAt: -1 });

const replySchema = new Schema(
  {
    post: ref("CommunityPost", { required: true, index: true }),
    author: ref("User", { required: true }),
    body: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true, toJSON }
);

/* ---------- Certificates ---------- */
export const CERTIFICATE_BADGES = ["Gloxad Certified", "Specialization"];

const certificateSchema = new Schema(
  {
    user: ref("User", { required: true, index: true }),
    cohort: ref("Cohort", { required: true }),
    trimester: ref("Trimester", { required: true }),
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "", trim: true },
    badge: { type: String, enum: CERTIFICATE_BADGES, default: "Gloxad Certified" },
    completedAt: { type: Date, default: Date.now },
    code: { type: String, required: true, unique: true },
  },
  { timestamps: true, toJSON }
);
certificateSchema.index({ user: 1, cohort: 1 }, { unique: true });

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

export const Lesson = model("Lesson", lessonSchema);
export const LessonProgress = model("LessonProgress", lessonProgressSchema);
export const LessonComment = model("LessonComment", lessonCommentSchema);
export const LmsQuiz = model("LmsQuiz", quizSchema);
export const QuizAttempt = model("QuizAttempt", quizAttemptSchema);
export const Assignment = model("Assignment", assignmentSchema);
export const AssignmentSubmission = model("AssignmentSubmission", submissionSchema);
export const CommunityPost = model("CommunityPost", postSchema);
export const CommunityReply = model("CommunityReply", replySchema);
export const LmsCertificate = model("LmsCertificate", certificateSchema);
