# Progress Tracker - Gloxad Academy Backend API

> Master Build Plan: [`00-build-plan.md`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/context/specs/00-build-plan.md)  
> Current Active Spec: [`16-frontend-integration-gap-remediation.md`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/context/specs/16-frontend-integration-gap-remediation.md)

---

## Current Phase
- **Phase 1**: Frontend Integration Gap Remediation & System Synchronization

## Current Goal
- [x] Milestone 12 (Unit 16: Frontend Integration Gap Remediation) [COMPLETED & VERIFIED].

---

## Phase 0 — Backend/Frontend Alignment (Oct 2026)

- [x] **A1 Media storage**: presigned URLs now support `logos/`, `signatures/`, `documents/`, `submissions/`, `certificates/` and `categories/`. Private folders (`certifications`, `documents`, `submissions`, `certificates`) return `key` only (`fileUrl: null`), are namespaced by owner id, and are read via `GET /api/upload/signed-url?key=...` (owner or admin only). Bucket/CORS restore itself is an AWS-side task.
- [x] **A2 API CORS**: `https://www.gloxadacademy.com`, `https://gloxadacademy.com` and `http://localhost:3000` are always allowed; `FRONTEND_ORIGIN` (comma-separated) adds staging/others.
- [x] **A3 Category images**: `POST/PUT /api/admin/categories` accept, validate (http/https only) and persist `imageUrl`.
- [x] **A4 Token refresh**: `POST /api/auth/refresh` accepts tokens expired up to 5 minutes and returns `{ token, user }`.
- [x] **A7/D8 Health**: `GET /api/health/liveness` and `GET /api/health/readiness` (MongoDB + S3; 503 when a dependency is down). `/api/health` kept.
- [x] **Validation errors**: Mongoose validation failures now return `{ error, fields: { "<dot.path>": "<message>" } }`; other errors keep the single-key `{ error }` shape.
- [ ] **A5/D7**: OpenAPI 3.0 file at `/api/openapi.json` + Postman collection, and the staging environment with seeded `student`/`instructor`/`admin`/`institution_admin` accounts.
- Verified by `npm run test:phase0` (33 checks).

---

## Trimester LMS API (`/api/lms/*`, Oct 2026)

Spec and endpoint reference: [`17-trimester-lms-api.md`](specs/17-trimester-lms-api.md).

- [x] **Models** (`Lms.model.js`): Trimester, Cohort, LmsWeek, LmsProgress, LmsAnnouncement, Inquiry, LiveSession (polls, hands, shared code), LiveMessage, LiveAttendance, CodeLab, CodeSubmission.
- [x] **Student screens**: my cohorts, dashboard, curriculum + weekly path (day status computed from the cohort start date), progress, announcements.
- [x] **Help Center**: inquiries with owner-checked private attachments (`documents/` folder), admin replies and status.
- [x] **Live classes**: sessions, join (attendance + LiveKit room token), start/end, chat, polls, raise hand, people, shared code; realtime events on the `/live` Socket.io namespace.
- [x] **Coding labs**: lab files and tests, submissions (stored as `unverified`; there is no server-side code sandbox yet).
- [x] **Admin setup**: trimesters, weekly plans (item ids survive edits), cohorts and members, live sessions, labs.
- [x] Verified by `npm run test:lms` (113 checks) against seeded demo data.
- [ ] Not built yet: community forum, assignments and grading, server-side code runner, trimester payments/enrolment, OpenAPI file.

---

## Units Progress Summary

- [x] **Audit & Scaffolding**: Initial repository analysis, rule violation fixes, and dependency installation.
- [x] **Milestone 1 (01-auth-email-otp)**: User Authentication, Email & OTP System [COMPLETED]
  - [x] **Unit 01**: Core Foundation & Centralized Error Infrastructure
  - [x] **Unit 02**: Authentication Core & JWT Access Guards
  - [x] **Unit 03**: Email OTP Verification & Password Recovery System
  - [x] **Phase 1 Alignment (Handoff P0/P1 Blockers)**:
    - [x] Student & Tutor OTP dispatch on signup (4-digit CSPRNG).
    - [x] Session token return on signup (`201 { token, user }`).
    - [x] Verify email updated user return (`200 { message, user }`).
    - [x] `POST /api/auth/resend-verification` implemented.
    - [x] `PUT /api/auth/update-profile` implemented.
    - [x] Server-side session revocation via `tokenVersion`.
    - [x] Isolated rate-limit buckets with `Retry-After`.
    - [x] Multi-provider email integration (Brevo REST API, SMTP Relay, Resend, and Dev Logger fallback).
- [x] **Unit 04**: User Profile Management & AWS S3 Presigned Media Offloading [COMPLETED & VERIFIED]
  - [x] **Phase 1 Alignment**:
    - [x] Upload Presigned URL Generation (S3 offloading) implemented.
    - [x] Direct Media Upload Verification (Client -> S3) verified.
    - [x] AWS S3 Bucket Policy (`s3:GetObject`) & Public Access permissions resolved for public asset rendering (`arn:aws:s3:::amzn-v3-buccket-gloxad-sstone/*`).
    - [x] Frontend Integration Workflow documented in API Docs (`POST /api/upload/presigned-url` -> `PUT /api/auth/update-profile`).
    - [x] Full Profile Update with Collision Prevention & Nested Object Preservation implemented.
- [x] **Unit 05**: Course Taxonomy & Category Management [COMPLETED & VERIFIED]
- [x] **Unit 06**: Course Catalog & Public Discovery (with Content Protection) [COMPLETED & VERIFIED]
- [x] **Unit 07**: Tutor Onboarding & Analytics [COMPLETED & VERIFIED]
- [x] **Unit 08**: 5-Step Course Authoring Wizard & Review Pipeline [COMPLETED & VERIFIED]
- [x] **Unit 09**: Admin Moderation, User Management & Platform Operations [COMPLETED & VERIFIED]
- [x] **Unit 10**: Course Enrollments & Paystack Payment Verification [COMPLETED & VERIFIED]
- [x] **Unit 11**: Idempotent Paystack Webhook Processing [COMPLETED & VERIFIED]
- [x] **Unit 12**: Learning Engine (Progress, Server-Side Quiz Grading, Q&A, Notes, Certificate) [COMPLETED & VERIFIED]
- [x] **Unit 13**: Real-Time Messaging & In-App Notifications (REST + Socket.io) [COMPLETED & VERIFIED]
- [x] **Unit 14**: Interactive API Documentation Web Page [COMPLETED & VERIFIED]
- [x] **Unit 15**: Seed Data & End-to-End System Smoke Tests [COMPLETED & VERIFIED]
- [x] **Unit 16**: Frontend Integration Gap Remediation & System Synchronization [COMPLETED & VERIFIED]

---

## Completed in Milestone 1

### Units 01 - 03 (`01-auth-email-otp.md`)
1. **Dependencies**: `jsonwebtoken`, `bcryptjs`, `nodemailer`, `express-rate-limit`, `cors`, `helmet`.
2. **Environment & Database Configuration**:
   - [`src/config/env.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/config/env.js): Validated `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_ORIGIN`, SMTP settings.
   - [`.env.example`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/.env.example): Fully documented configuration keys.
   - [`src/config/db.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/config/db.js): Robust Mongoose connection lifecycle handler.
3. **Data Models**:
   - [`src/models/User.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/User.model.js): Standardized password hashing hook, full `name` calculation, `approvalStatus` (`pending` for instructors, `approved` for students), `socials`, `avatarUrl`, and automatic `toJSON` stripping of `password` and `__v`.
   - [`src/models/Otp.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Otp.model.js): Hashed OTP records with MongoDB TTL auto-deletion index (`expires: 0`) and `consumed` tracking.
4. **Middlewares & Utilities**:
   - [`src/utils/hash.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/hash.js): Bcrypt salt hashing & comparison.
   - [`src/utils/jwt.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/jwt.js): JWT token signing & verification (`7d` expiry).
   - [`src/utils/email.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/email.js): Hybrid email dispatch (SMTP + dev logger fallback).
   - [`src/middlewares/auth.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/auth.middleware.js): Bearer JWT extraction and `req.user` injection.
   - [`src/middlewares/role.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/role.middleware.js): Role authorization guard.
   - [`src/middlewares/rateLimiter.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/rateLimiter.middleware.js): IP rate limiting for auth & OTP routes.
   - [`src/middlewares/error.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/error.middleware.js): Centralized error formatter adhering to Rule 1 (`{ "error": "<message>" }`).
5. **Controllers & Routes (`src/controllers/auth.controller.js` & `src/routes/auth.routes.js`)**:
   - `POST /api/auth/signup`: User registration (Student / Instructor with 4-digit OTP).
   - `POST /api/auth/signin`: Stateless authentication & JWT issuance.
   - `GET /api/auth/me`: Authenticated user profile context.
   - `POST /api/auth/signout`: Session termination acknowledgment.
   - `POST /api/auth/verify-email`: 4-digit OTP email verification.
   - `POST /api/auth/forget-passwd`: 5-digit recovery OTP request (anti-enumeration protected).
   - `POST /api/auth/verify-otp`: 5-digit OTP validation without consumption.
   - `POST /api/auth/reset-passwd`: Consumes OTP and sets new password.
   - `POST /api/auth/update-password`: Authenticated password change.

---

### Unit 04 (`04-user-profile-s3-upload.md`)
1. **Dependencies**:
   - Added AWS SDK v3: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.
2. **Environment & Configuration**:
   - Extended [`src/config/env.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/config/env.js) and [`.env.example`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/.env.example) to support `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_S3_BUCKET`.
3. **Data Model Updates**:
   - Updated [`src/models/User.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/User.model.js) to support `github` link in `socialLinksSchema` and guarantee consistent JSON virtuals output.
4. **AWS S3 Utility & Dev Fallback**:
   - Created [`src/utils/s3.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/utils/s3.js): Validates target folder prefixes (`avatars`, `courses`, `certifications`, `resources`), constructs standardized keys (`<folder>/<timestamp>-<uuid>_<sanitized_filename>`), sets 15-minute expiration (`expiresIn: 900`), and automatically falls back to simulated dev presigned URLs when AWS credentials are absent.
5. **Upload Controller & Routes**:
   - Implemented `POST /api/upload/presigned-url` and `PUT /api/upload/mock-put/*path` in [`src/controllers/upload.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/upload.controller.js) and [`src/routes/upload.routes.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/routes/upload.routes.js).
   - Mounted upload routes under `/api/upload` in [`src/app.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/app.js).
6. **User Profile Controller Refinements**:
   - Updated `PUT /api/auth/update-profile` in [`src/controllers/auth.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/auth.controller.js):
     - Validates username uniqueness and returns exact error envelope `400 {"error": "Username is already taken"}`.
     - Performs non-destructive partial updates on nested objects (`socialLinks`, `notificationPreferences`).
7. **Interactive API Documentation Portal Sync**:
   - Updated [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html) to render documentation blocks, request payload schema tables, and interactive response cards for both `PUT /api/auth/update-profile` and `POST /api/upload/presigned-url`.

---

### Unit 05 (`05-course-taxonomy-category-management.md`) [COMPLETED & VERIFIED]
1. **Data Models**:
   - [`src/models/Category.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Category.model.js): Hierarchical schema supporting `name`, `slug`, `icon`, `order`, and nested `subCategories` (`name`, `slug`, `topics`). Automatic slugification middleware on validate hook.
2. **Controllers & Routes**:
   - [`src/controllers/category.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/category.controller.js) & [`src/routes/category.routes.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/routes/category.routes.js):
     - `GET /api/categories`: Public retrieval of full category taxonomy sorted by `order` ascending, then `name` ascending.
     - `POST /api/admin/categories`: Admin-restricted creation of category documents with duplicate name checks and auto slug generation.
     - `PUT /api/admin/categories/:id`: Admin-restricted update of category fields with collision prevention and slug recalculation.
     - `DELETE /api/admin/categories/:id`: Admin-restricted deletion with active course dependency safeguard.
3. **Role Guard Middleware**:
   - [`src/middlewares/role.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/role.middleware.js): Updated to support `roleMiddleware` alias and deliver exact `403 {"error": "Access denied. Admin role required"}` response for admin routes.
4. **Interactive API Documentation Portal Sync**:
   - Updated [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html) to render Section 5 ("Course Taxonomy & Category Management"), navigation links, TOC anchors, parameter tables, and request/response cards for `GET /api/categories`, `POST /api/admin/categories`, `PUT /api/admin/categories/:id`, and `DELETE /api/admin/categories/:id`.

---

### Unit 06 (`06-course-catalog-public-discovery.md`) [COMPLETED & VERIFIED]
1. **Data Models**:
   - [`src/models/Course.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Course.model.js): Schema for `Course` including `lessonSchema`, `quizQuestionSchema`, `quizSchema`, `moduleSchema`, and full-text search indexes (`title`, `subtitle`, `description`, `topic`, `skills`).
2. **Middlewares**:
   - [`src/middlewares/optionalAuth.middleware.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/middlewares/optionalAuth.middleware.js): Optional JWT authentication middleware extracting `req.user` without rejecting unauthenticated callers.
3. **Controllers & Routes**:
   - [`src/controllers/course.controller.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/controllers/course.controller.js) & [`src/routes/course.routes.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/routes/course.routes.js):
     - `GET /api/courses`: Public course catalog listing with full-text search (`$text`), category/subCategory regex filters, courseType & level enum filters, price range filter, sorting (`newest`, `popular`, `price-asc`, `price-desc`, `rating`), and pagination.
     - `GET /api/courses/:slugOrId`: Public single course view by MongoDB `_id` or `slug` with Rule 3 content protection shield (`videoUrl` redacted for non-preview lessons unless enrolled/tutor/admin; `correctOptionIndex` stripped from quiz questions for non-tutors/admins).
4. **Interactive API Documentation Portal Sync**:
   - Updated [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html) to render Section 6 ("Course Catalog & Public Discovery"), navigation links, TOC anchors, parameter tables, content shield badges, and request/response cards for `GET /api/courses` and `GET /api/courses/:slugOrId`.

---

## Verification Results Checklist (100% Passed)

- [x] `GET /`: Returns HTML API documentation portal conforming to `ui-context.md`.
- [x] `GET /api/unknown-endpoint`: Returns `404 {"error": "Route not found"}`.
- [x] `POST /api/auth/signup (validation)`: Returns `400 {"error": "First name, email, and password are required"}`.
- [x] `POST /api/auth/signup (student)`: Returns `201 Created` with `user` object retaining `_id` and stripping `password`.
- [x] `POST /api/auth/signup (duplicate)`: Returns `409 Conflict {"error": "User with this email or username already exists"}`.
- [x] `POST /api/auth/signup (instructor)`: Sets `approvalStatus: "pending"`, generates 4-digit verification OTP, dispatches email.
- [x] `POST /api/auth/verify-email (invalid)`: Returns `400 {"error": "Invalid or expired OTP code"}`.
- [x] `POST /api/auth/verify-email (valid)`: Returns `200 {"message": "Email verified successfully"}` and marks `isVerified: true`.
- [x] `POST /api/auth/signin (invalid)`: Returns `401 {"error": "Invalid email or password"}`.
- [x] `POST /api/auth/signin (valid)`: Returns `200` with JWT Bearer token and sanitized user profile.
- [x] `GET /api/auth/me (unauthenticated)`: Returns `401 {"error": "Authentication token missing or malformed"}`.
- [x] `GET /api/auth/me (authenticated)`: Returns `200` with populated user document (`_id` preserved).
- [x] `POST /api/auth/forget-passwd`: Returns `200 {"message": "Password reset OTP dispatched to email"}` with anti-enumeration protection.
- [x] `POST /api/auth/verify-otp`: Returns `200 {"valid": true, "message": "OTP is valid"}` without consuming code.
- [x] `POST /api/auth/reset-passwd`: Consumes OTP and resets password.
- [x] `POST /api/auth/update-password`: Verifies current password and updates to new password.
- [x] `POST /api/auth/signout`: Returns `200 {"message": "Successfully signed out"}`.
- [x] `POST /api/upload/presigned-url (unauthenticated)`: Returns `401 {"error": "Authentication token missing or malformed"}`.
- [x] `POST /api/upload/presigned-url (missing body)`: Returns `400 {"error": "Filename and fileType are required"}`.
- [x] `POST /api/upload/presigned-url (valid request)`: Returns `200` containing `uploadUrl`, `fileUrl`, `key`, and `expiresIn: 900`.
- [x] `PUT /api/auth/update-profile (duplicate username)`: Returns `400 {"error": "Username is already taken"}`.
- [x] `PUT /api/auth/update-profile (successful update)`: Returns `200` with updated user profile retaining `_id`.
- [x] `GET /api/categories (public read)`: Returns `200 OK` with full category taxonomy array.
- [x] `POST /api/admin/categories (unauthenticated)`: Returns `401 {"error": "Authentication token missing or malformed"}`.
- [x] `POST /api/admin/categories (non-admin student)`: Returns `403 {"error": "Access denied. Admin role required"}`.
- [x] `POST /api/admin/categories (missing name)`: Returns `400 {"error": "Category name is required"}`.
- [x] `POST /api/admin/categories (valid creation)`: Returns `201 Created` with category object and auto-slugified subcategories.
- [x] `POST /api/admin/categories (duplicate name)`: Returns `409 Conflict {"error": "Category with this name already exists"}`.
- [x] `PUT /api/admin/categories/:id (valid update)`: Returns `200 OK` with updated fields and re-slugified name.
- [x] `DELETE /api/admin/categories/:id (course dependency safeguard)`: Returns `409 Conflict {"error": "Cannot delete category currently associated with active courses"}`.
- [x] `DELETE /api/admin/categories/:id (unreferenced deletion)`: Returns `200 OK {"message": "Category deleted successfully"}`.
- [x] `GET /api/courses (public read)`: Returns 200 OK with published courses and pagination metadata.
- [x] `GET /api/courses (filters & search)`: Filters courses by search, category, courseType, level, minPrice/maxPrice, and sort.
- [x] `GET /api/courses/:slugOrId (content shield)`: Redacts video URLs for non-free preview lessons and strips quiz answers for un-enrolled callers.
- [x] `GET /api/courses/:slugOrId (not found)`: Returns 404 {"error": "Course not found"}.
- [x] `POST /api/tutor/showcase-expertise (unauthenticated)`: Returns `401 {"error": "Authentication token missing or malformed"}`.
- [x] `POST /api/tutor/showcase-expertise (validation)`: Returns `400 {"error": "Area of expertise and expertise bio are required"}`.
- [x] `POST /api/tutor/showcase-expertise (valid)`: Updates profile, sets `approvalStatus: "pending"`, upgrades student role to `instructor`, returns `200 OK` with updated user object retaining `_id`.
- [x] `GET /api/tutor/dashboard-stats (student)`: Returns `403 {"error": "Access denied. Instructor role required"}`.
- [x] `GET /api/tutor/dashboard-stats (instructor)`: Returns `200 OK` with `totalCourses`, `publishedCourses`, `pendingCourses`, `draftCourses`, `totalStudents`, `averageRating`, and `totalRevenue`.
- [x] `GET /api/tutor/earnings (student)`: Returns `403 {"error": "Access denied. Instructor role required"}`.
- [x] `GET /api/tutor/earnings (instructor)`: Returns `200 OK` with `totalEarnings`, `withdrawableBalance`, `pendingBalance`, `monthlyBreakdown`, and `recentTransactions`.
- [x] `GET / (API docs portal sync)`: Verified HTML portal contains sections for `showcase-expertise`, `dashboard-stats`, `earnings`, and course authoring wizard.
- [x] `POST /api/tutor/courses (draft creation)`: Creates step 1 draft course with auto-slug generation (`201 Created`). Validates required fields (`400 Bad Request`).
- [x] `PUT /api/tutor/courses/:id (incremental updates)`: Incrementally updates steps 2-4 content for draft/rejected courses (`200 OK`). Restricts edits on pending/published courses (`400 Bad Request`).
- [x] `GET /api/tutor/courses (instructor directory)`: Returns list of instructor's owned courses across all status lifecycles (`200 OK`).
- [x] `GET /api/tutor/courses/:id (unshielded author preview)`: Returns full unshielded draft preview including video URLs and quiz answers for course owner (`200 OK`). Restricts non-owners (`403 Forbidden`).
- [x] `POST /api/tutor/courses/:id/submit (review submission)`: Validates 5-step completeness before transitioning status to `pending` (`200 OK`). Rejects incomplete courses (`400 Bad Request`).
- [x] `POST /api/tutor/courses/:id/appeal (rejection appeal)`: Submits rejection appeal creating `Appeal` document for `rejected` courses (`201 Created`). Rejects appeals on non-rejected courses (`400 Bad Request`).

- [x] `GET /api/admin/dashboard-stats`, `GET /api/admin/recent-registrations`, `GET /api/admin/recent-transactions`, `GET /api/admin/users`, `DELETE /api/admin/users/:id`, `PUT /api/admin/tutors/:id/approval`, `GET /api/admin/courses/pending`, `GET /api/admin/courses/all`, `PUT /api/admin/courses/:id/status`, `GET /api/admin/appeals`, `PUT /api/admin/appeals/:id/status`, `GET /api/admin/finance`, `POST /api/admin/broadcast`: All 13 admin endpoints fully implemented, RBAC-protected (`admin` role), and synchronized with interactive docs portal.

- [x] `POST /api/enrollments/enroll/:courseId`, `POST /api/enrollments/checkout`, `GET /api/enrollments/my-courses`, `GET /api/enrollments/check/:courseId`: All 4 enrollment endpoints implemented, Paystack verification active, revenue share (70% instructor / 30% platform) calculated, idempotency enforced, and synchronized with interactive docs portal.

- [x] `POST /api/webhooks/paystack`: HMAC-SHA512 signature verified against raw payload, idempotent transaction reference check, 70/30 instructor/platform revenue split calculated, active enrollment created, course `enrolledCount` incremented, student notification created, and synchronized with interactive docs portal.

- [x] `POST /api/learning/:courseId/progress`, `POST /api/learning/:courseId/quiz/:quizId/submit`, `GET /api/learning/:courseId/questions`, `POST /api/learning/:courseId/questions`, `POST /api/learning/:courseId/questions/:questionId/reply`, `GET /api/learning/:courseId/notes`, `POST /api/learning/:courseId/notes`, `DELETE /api/learning/:courseId/notes/:noteId`, `GET /api/learning/:courseId/announcements`, `POST /api/learning/:courseId/announcements`, `GET /api/learning/:courseId/certificate`, `GET /api/learning/verify-certificate/:certificateId`: All 12 learning engine endpoints fully implemented, enrollment-guarded, server-side quiz answers shielded (Rule 3), progress & 100% completion auto-tracked, verifiable completion certificates issued, and synchronized with interactive docs portal.

- [x] `GET /`: Interactive API documentation portal served at `GET /` (`src/views/docs.html`) via `src/controllers/docs.controller.js`. Includes `#apiSearchInput` filter, `#globalJwtToken` persistence in `localStorage`, 5 Architectural Invariants banner, and dynamic "Try It Out" live HTTP sandbox drawers across all 43 REST endpoints.

- [x] `npm run seed` & `npm run test:smoke`: Database seeding engine and automated E2E system smoke test suite fully implemented, enforcing 100% compliance across all 5 architectural invariants and 7 end-to-end user flows.

---

### Unit 16 (`16-frontend-integration-gap-remediation.md`) [COMPLETED & VERIFIED]
1. **Data Models & Schema Updates**:
   - [`src/models/Review.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Review.model.js): Implemented Course Review & Ratings engine with compound unique index `{ course: 1, student: 1 }`, `tutorReply` subdocument, and static method `recalculateCourseRating(courseId)` that keeps course average rating and count strictly updated.
   - [`src/models/PlatformSettings.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/PlatformSettings.model.js): Singleton configuration model with `getOrCreateSettings()` holding platform-wide toggles and defaults.
   - [`src/models/User.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/User.model.js): Added `experienceProofs`, `avatar`, and fully symmetric dual-key aliases in `toJSON`/`toObject` (`isVerified`/`isEmailVerified`, `bio`/`biography`/`expertiseBio`, `socials`/`socialLinks`, `avatar`/`avatarUrl`).
   - [`src/models/Category.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Category.model.js): Added `imageUrl` field.
   - [`src/models/Course.model.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/models/Course.model.js): Added `ratingsCount` field and synchronized with `rating.count` in `toJSON`.
2. **Configuration & Security**:
   - [`src/config/env.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/config/env.js) & [`src/app.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/app.js): Multi-origin CORS support parsing comma-separated origins in `FRONTEND_ORIGIN` with origin callback.
3. **Missing Workflows & REST Endpoints (12 new endpoints)**:
   - `POST /api/auth/refresh`: Stateless JWT token refresh returning `{ token, user }`.
   - `GET /api/admin/users/:id`: Full user profile detail including experience proofs and credential links.
   - `GET /api/admin/courses/:id`: Full unshielded course details for admin moderation.
   - `GET /api/admin/courses/pending`: Populated category object (`{ _id, name, slug, icon, imageUrl }`).
   - `GET /api/admin/settings`: Fetch singleton platform settings.
   - `PUT /api/admin/settings`: Update singleton platform settings.
   - `GET /api/tutor/search-instructors`: Search approved instructors by name or email with regex.
   - `POST /api/courses/:id/reviews`: Student review creation (enrolled students only, 1-5 rating, automatic course rating recalculation).
   - `GET /api/courses/:id/reviews`: Public paginated course reviews listing.
   - `GET /api/tutor/reviews`: Instructor course reviews listing with student details.
   - `POST /api/tutor/reviews/:id/reply`: Tutor response to review with student notification.
   - `GET /api/admin/reviews`: Admin review listing with moderation filters.
   - `DELETE /api/admin/reviews/:id`: Admin review deletion with course rating recalculation.
4. **Seed Engine & E2E Smoke Suite**:
   - [`src/seed.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/seed.js): Added reviews, platform settings, pending course fixtures, and instructor proofs across 10 collections.
   - [`scripts/test-e2e-smoke.js`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/scripts/test-e2e-smoke.js): Added `FLOW 8` covering all new Unit 16 endpoints. 13 suites, 47 assertions passing 100%.
5. **Interactive API Documentation Portal Sync**:
   - [`src/views/docs.html`](file:///c:/Users/THE%20LAPTOP%20STORE/Desktop/gloxard/src/views/docs.html): Added endpoint cards, parameter schemas, sidebar navigation pills, and right-hand TOC anchors for all Unit 16 endpoints (55 REST endpoints total).

---

## Next Up
- **All Phase 1 Units Completed & Fully Verified (100%)**


---

## Architecture Decisions & Invariants Enforced
- **Rule 1: Uniform Error Schema**: All 4xx and 5xx responses strictly return `{ "error": "<message>" }`.
- **Rule 2: Zero File Buffering**: Direct-to-cloud file upload offloading strictly via AWS S3 PUT presigned URLs without streaming raw bytes through the API server.
- **Rule 3: Server Content Protection**: Lesson video URLs (for non-preview lessons) and quiz `correctOptionIndex` are strictly shielded server-side from non-enrolled or unauthenticated users.
- **Rule 5: Strict Identifier Standard**: Primary keys strictly retain `_id` and are never projected to `id`.
- **Stateless Auth**: JWT Bearer authorization in `Authorization: Bearer <token>` with 7-day expiration.
- **Unified Deployment**: `src/views/docs.html` is served directly by the Express app at `GET /`, guaranteeing that deploying the backend automatically deploys the updated documentation with zero manual steps.
- **Build Verification Invariant**: `npm run build` (`node scripts/build.js`) executes strict syntax validation (`node --check`) across all project files before every commit/deployment.