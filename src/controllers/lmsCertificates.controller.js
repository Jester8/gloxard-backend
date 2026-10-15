import { Cohort } from "../models/Lms.model.js";
import { CERTIFICATE_BADGES, LmsCertificate } from "../models/LmsLearning.model.js";
import { User } from "../models/User.model.js";
import { bad, isId, issueCertificate, monthYear, userProgressPercent } from "../utils/lmsLearning.js";

const certificateView = (certificate, cohortId = certificate.cohort) => ({
  _id: certificate._id,
  code: certificate.code,
  badge: certificate.badge,
  title: certificate.title,
  subtitle: certificate.subtitle,
  completedAt: certificate.completedAt,
  cohortId,
  trimesterId: certificate.trimester,
});

/**
 * GET /api/lms/certificates
 * Certificates the signed-in user has earned, and the cohorts they're still working toward (across all their cohorts).
 */
export const listCertificatesController = async (req, res, next) => {
  try {
    const earned = await LmsCertificate.find({ user: req.user._id }).sort({ completedAt: -1 });
    const earnedCohorts = new Set(earned.map((certificate) => String(certificate.cohort)));

    const cohorts = await Cohort.find({ students: req.user._id, status: "active" }).populate("trimester").sort({ startsAt: -1 });
    const inProgress = [];
    for (const cohort of cohorts) {
      if (earnedCohorts.has(String(cohort._id)) || !cohort.trimester) continue;
      inProgress.push({
        cohortId: cohort._id,
        trimester: cohort.trimester.name,
        title: cohort.trimester.programName,
        expected: monthYear(cohort.trimester.endsAt),
        expectedAt: cohort.trimester.endsAt,
        progress: await userProgressPercent(cohort, req.user._id),
      });
    }

    return res.status(200).json({ earned: earned.map((certificate) => certificateView(certificate)), inProgress });
  } catch (error) {
    next(error);
  }
};

/** POST /api/lms/admin/certificates  { userId, cohortId, badge? }  (issues manually; idempotent) */
export const issueCertificateController = async (req, res, next) => {
  try {
    const { userId, cohortId, badge } = req.body || {};
    if (!isId(userId)) return bad(res, "userId", "A valid userId is required");
    if (!isId(cohortId)) return bad(res, "cohortId", "A valid cohortId is required");
    if (badge !== undefined && !CERTIFICATE_BADGES.includes(badge)) return bad(res, "badge", `Badge must be one of: ${CERTIFICATE_BADGES.join(", ")}`);

    const [user, cohort] = await Promise.all([User.findById(userId).select("_id"), Cohort.findById(cohortId).populate("trimester")]);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!cohort) return res.status(404).json({ error: "Cohort not found" });
    if (!cohort.students.some((id) => id.equals(user._id))) return bad(res, "userId", "This user is not a student in that cohort");

    const { certificate, created } = await issueCertificate(user._id, cohort, badge ? { badge } : {});
    return res.status(created ? 201 : 200).json({
      message: created ? "Certificate issued" : "Certificate was already issued",
      certificate: certificateView(certificate),
    });
  } catch (error) {
    next(error);
  }
};

