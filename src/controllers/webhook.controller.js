import mongoose from 'mongoose';
import { Transaction } from '../models/Transaction.model.js';
import { Enrollment } from '../models/Enrollment.model.js';
import { Course } from '../models/Course.model.js';
import { User } from '../models/User.model.js';
import { Notification } from '../models/Notification.model.js';
import { emitNotification } from '../socket/socket.handler.js';

/**
 * Handles Paystack webhooks (e.g. charge.success) idempotently
 * POST /api/webhooks/paystack
 */
export const handlePaystackWebhook = async (req, res, next) => {
  try {
    const { event, data } = req.body || {};

    if (!event || !data) {
      return res.status(400).json({ error: 'Invalid webhook payload structure' });
    }

    // Ignore non-payment events
    if (event !== 'charge.success') {
      return res.status(200).json({
        status: 'success',
        message: 'Event ignored',
        event,
      });
    }

    if (!data.reference) {
      return res.status(400).json({ error: 'Invalid webhook payload structure' });
    }

    // Idempotency check: if transaction with this reference has already succeeded
    const existingTx = await Transaction.findOne({ reference: data.reference });
    if (existingTx && existingTx.status === 'success') {
      return res.status(200).json({
        status: 'success',
        message: 'Webhook already processed',
        reference: data.reference,
      });
    }

    // Extract metadata
    const metadata = data.metadata || {};
    const studentId = metadata.student_id || metadata.studentId || metadata.userId || metadata.user_id;
    const courseId = metadata.course_id || metadata.courseId;

    if (!studentId || !courseId) {
      return res.status(400).json({ error: 'Invalid webhook payload structure: missing metadata IDs' });
    }

    // Validate referenced student and course
    let student = null;
    if (mongoose.Types.ObjectId.isValid(studentId)) {
      student = await User.findById(studentId);
    }

    let course = null;
    if (mongoose.Types.ObjectId.isValid(courseId)) {
      course = await Course.findById(courseId);
    }
    if (!course) {
      course = await Course.findOne({ slug: courseId });
    }

    if (!student || !course) {
      return res.status(404).json({ error: 'Referenced user or course not found' });
    }

    // Revenue calculations (Paystack amount is in Kobo)
    const amountInNaira = (data.amount || 0) / 100;
    const instructorShare = amountInNaira * 0.70;
    const platformShare = amountInNaira * 0.30;

    // Upsert or create Transaction document
    const transaction = await Transaction.findOneAndUpdate(
      { reference: data.reference },
      {
        reference: data.reference,
        user: student._id,
        course: course._id,
        amount: amountInNaira,
        currency: data.currency || 'NGN',
        status: 'success',
        gatewayResponse: data,
        instructorShare,
        platformShare,
      },
      { upsert: true, new: true }
    );

    // Upsert Enrollment document
    const existingEnrollment = await Enrollment.findOne({ user: student._id, course: course._id });
    await Enrollment.findOneAndUpdate(
      { user: student._id, course: course._id },
      {
        user: student._id,
        course: course._id,
        enrolledAt: existingEnrollment ? existingEnrollment.enrolledAt : new Date(),
      },
      { upsert: true, new: true }
    );

    // Increment course enrollment tally if new enrollment
    if (!existingEnrollment) {
      await Course.findByIdAndUpdate(course._id, { $inc: { enrolledCount: 1 } });
    }

    // Create student notification
    const enrollmentNotification = await Notification.create({
      recipient: student._id,
      title: 'Enrollment Confirmed',
      message: `You have successfully enrolled in ${course.title}.`,
      type: 'system',
      read: false,
      link: `/courses/${course.slug}`,
    });
    emitNotification(student._id.toString(), enrollmentNotification.toJSON());

    return res.status(200).json({
      status: 'success',
      message: 'Webhook processed successfully',
      reference: data.reference,
      transactionId: transaction._id,
    });
  } catch (error) {
    next(error);
  }
};

export default { handlePaystackWebhook };
