import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectDB from './config/db.js';

import { User } from './models/User.model.js';
import { Otp } from './models/Otp.model.js';
import { Category } from './models/Category.model.js';
import { Course } from './models/Course.model.js';
import { Enrollment } from './models/Enrollment.model.js';
import { Transaction } from './models/Transaction.model.js';
import { Question, Note, Announcement } from './models/QuestionNoteMisc.model.js';
import { Conversation } from './models/Conversation.model.js';
import { Message } from './models/Message.model.js';
import { Notification } from './models/Notification.model.js';
import { Appeal } from './models/Appeal.model.js';
import { Review } from './models/Review.model.js';
import { PlatformSettings } from './models/PlatformSettings.model.js';
import { seedLms } from './seedLms.js';

async function seedDatabase() {
  console.log('\x1b[36m==================================================\x1b[0m');
  console.log('\x1b[36m [SEEDING DATABASE] Gloxad Academy Seed Engine \x1b[0m');
  console.log('\x1b[36m==================================================\x1b[0m');

  // Safety check against production databases
  if (process.env.NODE_ENV === 'production') {
    console.error('\x1b[31m[ERROR] Database seeding is not permitted in production environment!\x1b[0m');
    process.exit(1);
  }

  try {
    // 1. Connect to MongoDB database
    await connectDB();
    console.log('\x1b[32m✔ Database connected\x1b[0m');

    // 2. Sequential Collection Teardown
    await User.deleteMany({});
    await Otp.deleteMany({});
    await Category.deleteMany({});
    await Course.deleteMany({});
    await Enrollment.deleteMany({});
    await Transaction.deleteMany({});
    await Question.deleteMany({});
    await Note.deleteMany({});
    await Announcement.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    await Notification.deleteMany({});
    await Appeal.deleteMany({});
    await Review.deleteMany({});
    await PlatformSettings.deleteMany({});
    console.log('\x1b[32m✔ Collections purged\x1b[0m');

    // 3. Pre-hash password for performance
    const plainPassword = 'Password123!';
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    console.log('\x1b[32m✔ Pre-hashed credentials ready\x1b[0m');

    // 4. Create Seed Users
    const adminUser = {
      firstName: 'System',
      lastName: 'Admin',
      name: 'System Admin',
      username: 'admin',
      email: 'admin@gloxad.com',
      password: hashedPassword,
      role: 'admin',
      approvalStatus: 'approved',
      isVerified: true,
      isActive: true,
      bio: 'Platform Lead Administrator',
      biography: 'Platform Lead Administrator',
      expertiseBio: 'Platform Lead Administrator'
    };

    const janeTutor = {
      firstName: 'Jane',
      lastName: 'Tutor',
      name: 'Jane Tutor',
      username: 'janetutor',
      email: 'jane.tutor@gloxad.com',
      password: hashedPassword,
      role: 'instructor',
      approvalStatus: 'approved',
      isVerified: true,
      isActive: true,
      title: 'Senior Fullstack Lead',
      bio: '10+ years building web applications.',
      biography: '10+ years building web applications.',
      expertiseBio: '10+ years building web applications.',
      areaOfExpertise: 'Web Development',
      experienceProofs: ['https://gloxad-bucket.s3.amazonaws.com/certifications/jane-degree.pdf'],
      avatarUrl: 'https://gloxad-bucket.s3.amazonaws.com/avatars/jane.jpg',
      socials: { github: 'https://github.com/janetutor', twitter: 'https://twitter.com/janetutor' }
    };

    const johnTutor = {
      firstName: 'John',
      lastName: 'Tutor',
      name: 'John Tutor',
      username: 'johntutor',
      email: 'john.tutor@gloxad.com',
      password: hashedPassword,
      role: 'instructor',
      approvalStatus: 'approved',
      isVerified: true,
      isActive: true,
      title: 'Data Science Expert',
      bio: 'Specializing in Python and Machine Learning.',
      biography: 'Specializing in Python and Machine Learning.',
      expertiseBio: 'Specializing in Python and Machine Learning.',
      areaOfExpertise: 'Data Science',
      experienceProofs: ['https://gloxad-bucket.s3.amazonaws.com/certifications/john-cert.pdf'],
      avatarUrl: 'https://gloxad-bucket.s3.amazonaws.com/avatars/john.jpg'
    };

    const pendingTutor = {
      firstName: 'Pending',
      lastName: 'Tutor',
      name: 'Pending Tutor',
      username: 'pendingtutor',
      email: 'pending.tutor@gloxad.com',
      password: hashedPassword,
      role: 'instructor',
      approvalStatus: 'pending',
      isVerified: false,
      isActive: true,
      title: 'Aspiring Tutor',
      bio: 'Awaiting admin approval.',
      biography: 'Awaiting admin approval.',
      expertiseBio: 'Awaiting admin approval.',
      areaOfExpertise: 'Design & UX',
      experienceProofs: ['https://gloxad-bucket.s3.amazonaws.com/certifications/pending-proof.pdf']
    };

    const aliceStudent = {
      firstName: 'Alice',
      lastName: 'Student',
      name: 'Alice Student',
      username: 'alicestudent',
      email: 'alice.student@gloxad.com',
      password: hashedPassword,
      role: 'student',
      approvalStatus: 'approved',
      isVerified: true,
      isActive: true,
      avatarUrl: 'https://gloxad-bucket.s3.amazonaws.com/avatars/alice.jpg'
    };

    const bobStudent = {
      firstName: 'Bob',
      lastName: 'Student',
      name: 'Bob Student',
      username: 'bobstudent',
      email: 'bob.student@gloxad.com',
      password: hashedPassword,
      role: 'student',
      approvalStatus: 'approved',
      isVerified: true,
      isActive: true,
      avatarUrl: 'https://gloxad-bucket.s3.amazonaws.com/avatars/bob.jpg'
    };

    const insertedUsers = await User.insertMany([
      adminUser,
      janeTutor,
      johnTutor,
      pendingTutor,
      aliceStudent,
      bobStudent
    ]);

    const admin = insertedUsers.find((u) => u.email === 'admin@gloxad.com');
    const jane = insertedUsers.find((u) => u.email === 'jane.tutor@gloxad.com');
    const john = insertedUsers.find((u) => u.email === 'john.tutor@gloxad.com');
    const alice = insertedUsers.find((u) => u.email === 'alice.student@gloxad.com');
    const bob = insertedUsers.find((u) => u.email === 'bob.student@gloxad.com');

    // 5. Create Seed Categories
    const categories = [
      {
        name: 'Web Development',
        slug: 'web-development',
        icon: 'code',
        imageUrl: 'https://gloxad-bucket.s3.amazonaws.com/categories/web-dev.jpg',
        order: 1,
        subCategories: [
          { name: 'Frontend', slug: 'frontend', topics: ['React'] },
          { name: 'Backend', slug: 'backend', topics: ['Node.js', 'Express'] }
        ]
      },
      {
        name: 'Data Science',
        slug: 'data-science',
        icon: 'bar-chart',
        imageUrl: 'https://gloxad-bucket.s3.amazonaws.com/categories/data-science.jpg',
        order: 2,
        subCategories: [
          { name: 'Machine Learning', slug: 'machine-learning', topics: ['PyTorch'] },
          { name: 'Python', slug: 'python', topics: ['Pandas'] }
        ]
      },
      {
        name: 'Design & UX',
        slug: 'design-ux',
        icon: 'figma',
        imageUrl: 'https://gloxad-bucket.s3.amazonaws.com/categories/design-ux.jpg',
        order: 3,
        subCategories: [
          { name: 'Figma', slug: 'figma', topics: ['Prototyping'] },
          { name: 'UI Design', slug: 'ui-design', topics: ['Wireframing'] }
        ]
      }
    ];

    const insertedCategories = await Category.insertMany(categories);

    // 6. Create Seed Courses
    const course1Data = {
      title: 'Fullstack JavaScript Mastery',
      subtitle: 'Master Node.js, Express, and Modern Web APIs',
      slug: 'fullstack-javascript-mastery',
      category: 'Web Development',
      subCategory: 'Backend',
      topic: 'Node.js',
      language: 'English',
      level: 'intermediate',
      courseType: 'paid',
      price: 49.99,
      discountPrice: 39.99,
      thumbnail: 'https://gloxad-bucket.s3.amazonaws.com/courses/fs-js-thumb.jpg',
      trailerVideoUrl: 'https://gloxad-bucket.s3.amazonaws.com/courses/fs-js-trailer.mp4',
      description: 'Comprehensive guide to backend development with JavaScript and Node.js.',
      skills: ['Node.js', 'Express', 'MongoDB', 'REST APIs'],
      targetAudience: ['Frontend Developers', 'Fullstack Engineers'],
      requirements: ['Basic JavaScript knowledge'],
      status: 'published',
      instructor: jane._id,
      enrolledCount: 1,
      rating: { average: 4.8, count: 12 },
      modules: [
        {
          title: 'Module 1: Introduction & Setup',
          lessons: [
            {
              title: 'Welcome & Setup',
              videoUrl: 'https://gloxad-bucket.s3.amazonaws.com/courses/welcome.mp4',
              duration: '05:00',
              isFreePreview: true
            },
            {
              title: 'Node.js Fundamentals',
              videoUrl: 'https://gloxad-bucket.s3.amazonaws.com/courses/node-fund.mp4',
              duration: '10:00',
              isFreePreview: false
            }
          ],
          quizzes: []
        },
        {
          title: 'Module 2: Express APIs & Quizzes',
          lessons: [
            {
              title: 'Express Routing',
              videoUrl: 'https://gloxad-bucket.s3.amazonaws.com/courses/express-routes.mp4',
              duration: '15:00',
              isFreePreview: false
            },
            {
              title: 'Middleware Deep Dive',
              videoUrl: 'https://gloxad-bucket.s3.amazonaws.com/courses/middleware.mp4',
              duration: '20:00',
              isFreePreview: false
            }
          ],
          quizzes: [
            {
              title: 'Express Concepts Quiz',
              passingScore: 70,
              questions: [
                {
                  questionText: 'What is Express?',
                  options: ['Framework', 'Database', 'Browser', 'OS'],
                  correctOptionIndex: 0
                },
                {
                  questionText: 'Which method defines a GET route?',
                  options: ['app.post()', 'app.get()', 'app.fetch()', 'app.put()'],
                  correctOptionIndex: 1
                }
              ]
            }
          ]
        }
      ]
    };

    const course2Data = {
      title: 'Python Data Science Bootcamp',
      subtitle: 'Learn Python, Pandas, and Data Analysis from scratch',
      slug: 'python-data-science-bootcamp',
      category: 'Data Science',
      subCategory: 'Python',
      topic: 'Pandas',
      language: 'English',
      level: 'beginner',
      courseType: 'free',
      price: 0,
      thumbnail: 'https://gloxad-bucket.s3.amazonaws.com/courses/py-ds-thumb.jpg',
      description: 'Hands-on intro to Data Science with Python and Pandas.',
      skills: ['Python', 'Pandas', 'Data Analysis'],
      status: 'published',
      instructor: john._id,
      enrolledCount: 1,
      rating: { average: 4.9, count: 8 },
      modules: [
        {
          title: 'Module 1: Python Basics',
          lessons: [
            {
              title: 'Intro to Python',
              videoUrl: 'https://gloxad-bucket.s3.amazonaws.com/courses/py-intro.mp4',
              duration: '08:00',
              isFreePreview: true
            },
            {
              title: 'Pandas DataFrames',
              videoUrl: 'https://gloxad-bucket.s3.amazonaws.com/courses/pandas.mp4',
              duration: '12:00',
              isFreePreview: true
            }
          ],
          quizzes: [
            {
              title: 'Python Quiz',
              passingScore: 70,
              questions: [
                {
                  questionText: 'What is Pandas?',
                  options: ['Data Analysis library', 'Animal', 'Compiler', 'Game'],
                  correctOptionIndex: 0
                }
              ]
            }
          ]
        }
      ]
    };

    const course3Data = {
      title: 'Figma UI/UX Design Essentials',
      subtitle: 'Design modern web and mobile apps using Figma',
      slug: 'figma-ui-ux-design-essentials',
      category: 'Design & UX',
      subCategory: 'Figma',
      topic: 'Prototyping',
      language: 'English',
      level: 'beginner',
      courseType: 'paid',
      price: 29.99,
      thumbnail: 'https://gloxad-bucket.s3.amazonaws.com/courses/figma-thumb.jpg',
      description: 'Master UI/UX prototyping with Figma.',
      skills: ['Figma', 'UI Design', 'Wireframing'],
      status: 'draft',
      instructor: jane._id,
      modules: []
    };

    const course4Data = {
      title: 'Advanced Figma Design Systems',
      subtitle: 'Build production-ready tokenized design systems',
      slug: 'advanced-figma-design-systems',
      category: insertedCategories[2]._id,
      subCategory: 'Figma',
      topic: 'Prototyping',
      language: 'English',
      level: 'intermediate',
      courseType: 'paid',
      price: 39.99,
      thumbnail: 'https://gloxad-bucket.s3.amazonaws.com/courses/figma-sys.jpg',
      description: 'Master advanced design systems and tokens.',
      skills: ['Figma', 'Design Systems', 'Tokens'],
      status: 'pending',
      instructor: jane._id,
      modules: []
    };

    const insertedCourses = await Course.insertMany([course1Data, course2Data, course3Data, course4Data]);
    const course1 = insertedCourses[0];
    const course2 = insertedCourses[1];
    const course4 = insertedCourses[3];

    const c1Lesson1Id = course1.modules[0].lessons[0]._id;
    const c1Lesson2Id = course1.modules[0].lessons[1]._id;
    const c2Lesson1Id = course2.modules[0].lessons[0]._id;
    const c2Lesson2Id = course2.modules[0].lessons[1]._id;

    // 7. Create Seed Enrollments & Transactions
    const enrollments = [
      {
        user: alice._id,
        course: course1._id,
        enrolledAt: new Date(),
        completedLessons: [c1Lesson1Id, c1Lesson2Id],
        progressPercentage: 50
      },
      {
        user: bob._id,
        course: course2._id,
        enrolledAt: new Date(),
        completedLessons: [c2Lesson1Id, c2Lesson2Id],
        progressPercentage: 100,
        isCompleted: true,
        completedAt: new Date(),
        certificateId: 'CERT-SEED-BOB-001'
      }
    ];

    const insertedEnrollments = await Enrollment.insertMany(enrollments);

    const transactions = [
      {
        reference: 'SEED_REF_1001',
        user: alice._id,
        course: course1._id,
        amount: 49.99,
        currency: 'NGN',
        status: 'success',
        instructorShare: 34.99,
        platformShare: 15.00,
        gatewayResponse: { status: 'success', message: 'Seed transaction' }
      },
      {
        reference: 'SEED_REF_1002',
        user: bob._id,
        course: course2._id,
        amount: 0,
        currency: 'NGN',
        status: 'success',
        instructorShare: 0,
        platformShare: 0,
        gatewayResponse: { status: 'success', message: 'Free course enrollment' }
      }
    ];

    const insertedTransactions = await Transaction.insertMany(transactions);

    // 8. Create Seed Conversations & Messages
    const groupConv = {
      isGroup: true,
      courseId: course1._id,
      participants: [jane._id, alice._id, bob._id]
    };

    const directConv = {
      isGroup: false,
      participants: [jane._id, alice._id]
    };

    const insertedConversations = await Conversation.insertMany([groupConv, directConv]);
    const groupConvDoc = insertedConversations[0];
    const directConvDoc = insertedConversations[1];

    const messages = [
      {
        conversationId: directConvDoc._id,
        sender: jane._id,
        text: 'Hi Alice, welcome to Fullstack JavaScript Mastery!',
        readBy: [jane._id, alice._id]
      },
      {
        conversationId: directConvDoc._id,
        sender: alice._id,
        text: 'Thanks Jane! Excited to start learning.',
        readBy: [jane._id, alice._id]
      },
      {
        conversationId: groupConvDoc._id,
        sender: jane._id,
        text: 'Welcome everyone to the course channel!',
        readBy: [jane._id]
      },
      {
        conversationId: groupConvDoc._id,
        sender: alice._id,
        text: 'Hello everyone!',
        readBy: [alice._id]
      }
    ];

    const insertedMessages = await Message.insertMany(messages);

    await Conversation.findByIdAndUpdate(directConvDoc._id, { lastMessage: insertedMessages[1]._id });
    await Conversation.findByIdAndUpdate(groupConvDoc._id, { lastMessage: insertedMessages[3]._id });

    // 9. Create Seed Notifications
    const notifications = [
      {
        recipient: alice._id,
        title: 'Welcome to Gloxad Academy',
        message: 'Welcome to the platform! Explore our catalog and start learning.',
        type: 'system_broadcast',
        read: false
      },
      {
        recipient: jane._id,
        title: 'Course Published',
        message: 'Your course "Fullstack JavaScript Mastery" is live on Gloxad Academy.',
        type: 'course_update',
        read: true
      }
    ];

    const insertedNotifications = await Notification.insertMany(notifications);

    // 10. Create Seed Platform Settings
    const platformSettings = await PlatformSettings.create({
      allowSignups: true,
      allowPasswordReset: true,
      deletionGraceDays: 30,
      signatureUrl: 'https://gloxad-bucket.s3.amazonaws.com/signatures/dean-signature.png'
    });

    // 11. Create Seed Course Reviews
    const reviews = [
      {
        course: course1._id,
        student: alice._id,
        rating: 5,
        comment: 'Exceptional course! Very clear and easy to follow.',
        tutorReply: {
          comment: 'Thank you Alice! Keep building amazing projects.',
          createdAt: new Date()
        }
      },
      {
        course: course2._id,
        student: bob._id,
        rating: 5,
        comment: 'The Pandas section was thorough and well structured.',
        tutorReply: {
          comment: '',
          createdAt: null
        }
      }
    ];

    const insertedReviews = await Review.insertMany(reviews);
    await Review.recalculateCourseRating(course1._id);
    await Review.recalculateCourseRating(course2._id);

    // 12. Print Visual Summary Table
    console.log('\x1b[32m✔ Seed data generated & inserted successfully!\x1b[0m\n');
    console.log('+--------------------+-------+');
    console.log('| Entity             | Count |');
    await seedLms({ admin, jane, alice, bob });
    console.log('+--------------------+-------+');
    console.log(`| Users              | ${insertedUsers.length.toString().padEnd(5)} |`);
    console.log(`| Categories         | ${insertedCategories.length.toString().padEnd(5)} |`);
    console.log(`| Courses            | ${insertedCourses.length.toString().padEnd(5)} |`);
    console.log(`| Enrollments        | ${insertedEnrollments.length.toString().padEnd(5)} |`);
    console.log(`| Transactions       | ${insertedTransactions.length.toString().padEnd(5)} |`);
    console.log(`| Messages           | ${insertedMessages.length.toString().padEnd(5)} |`);
    console.log(`| Conversations      | ${insertedConversations.length.toString().padEnd(5)} |`);
    console.log(`| Notifications      | ${insertedNotifications.length.toString().padEnd(5)} |`);
    console.log(`| Reviews            | ${insertedReviews.length.toString().padEnd(5)} |`);
    console.log(`| Platform Settings  | 1     |`);
    console.log(`| LMS demo data      | yes   |`);
    console.log('+--------------------+-------+\n');

    console.log('\x1b[32m[SEED SUCCESS] Database seeding completed cleanly!\x1b[0m');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('\x1b[31m[ERROR] Database seeding failed:\x1b[0m', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

seedDatabase();
