import { CodeLab, CodeSubmission } from "../models/Lms.model.js";

const MAX_FILE_CHARS = 100000;
const MAX_FILES = 10;

const labList = (lab, mine) => ({
  slug: lab.slug,
  title: lab.title,
  module: lab.module,
  estimate: lab.estimate,
  submitted: !!mine,
  best: mine ? { passed: mine.passed, total: mine.total } : null,
});

/** GET /api/lms/code-labs */
export const listCodeLabsController = async (req, res, next) => {
  try {
    const labs = await CodeLab.find({ published: true }).sort({ createdAt: 1 }).select("slug title module estimate");
    const submissions = await CodeSubmission.find({ user: req.user._id, lab: { $in: labs.map((lab) => lab._id) } })
      .sort({ reportedPassed: -1, createdAt: -1 })
      .select("lab reportedPassed reportedTotal");
    const bestByLab = new Map();
    for (const submission of submissions) {
      const key = String(submission.lab);
      if (!bestByLab.has(key)) bestByLab.set(key, { passed: submission.reportedPassed, total: submission.reportedTotal });
    }
    return res.status(200).json({ labs: labs.map((lab) => labList(lab, bestByLab.get(String(lab._id)))) });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/code-labs/:slug  (starter files, the read-only tests file, steps and hints) */
export const getCodeLabController = async (req, res, next) => {
  try {
    const lab = await CodeLab.findOne({ slug: req.params.slug.toLowerCase(), published: true });
    if (!lab) return res.status(404).json({ error: "Coding lab not found" });
    return res.status(200).json({ lab });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/lms/code-labs/:slug/submissions  { files: [{ name, content }], passed, total }
 * `passed`/`total` come from the browser runner and are stored as unverified; there is no server-side sandbox yet.
 */
export const submitCodeLabController = async (req, res, next) => {
  try {
    const lab = await CodeLab.findOne({ slug: req.params.slug.toLowerCase(), published: true });
    if (!lab) return res.status(404).json({ error: "Coding lab not found" });

    const { files, passed, total } = req.body || {};
    const fields = {};
    const editable = new Map(lab.files.filter((file) => !file.readOnly).map((file) => [file.name, file]));

    if (!Array.isArray(files) || files.length === 0) {
      fields.files = "Submit at least one file";
    } else if (files.length > MAX_FILES) {
      fields.files = `Submit at most ${MAX_FILES} files`;
    } else {
      for (const file of files) {
        if (typeof file?.name !== "string" || !editable.has(file.name)) {
          fields.files = `Only these files can be submitted: ${[...editable.keys()].join(", ")}`;
          break;
        }
        if (typeof file.content !== "string" || file.content.length > MAX_FILE_CHARS) {
          fields.files = "Each file must be text up to 100KB";
          break;
        }
      }
    }
    if (!Number.isInteger(passed) || !Number.isInteger(total) || passed < 0 || total < 1 || passed > total) {
      fields.passed = "Report how many checks passed out of the total";
    }
    if (Object.keys(fields).length) return res.status(400).json({ error: Object.values(fields).join(". "), fields });

    const submission = await CodeSubmission.create({
      user: req.user._id,
      lab: lab._id,
      files: files.map((file) => ({ name: file.name, content: file.content })),
      reportedPassed: passed,
      reportedTotal: total,
    });
    return res.status(201).json({ message: "Submission saved", submission });
  } catch (error) {
    next(error);
  }
};

/** GET /api/lms/code-labs/:slug/submissions/me  (latest first; the newest one restores your work on another device) */
export const getMySubmissionsController = async (req, res, next) => {
  try {
    const lab = await CodeLab.findOne({ slug: req.params.slug.toLowerCase() }).select("_id");
    if (!lab) return res.status(404).json({ error: "Coding lab not found" });
    const submissions = await CodeSubmission.find({ user: req.user._id, lab: lab._id }).sort({ createdAt: -1 }).limit(10);
    return res.status(200).json({ submissions });
  } catch (error) {
    next(error);
  }
};
