/**
 * NEUROVAULT — Instructor Routes
 * Endpoints for Course Builder, Gradebook, and Student Enrollment tracking.
 * All routes require instructor or admin role.
 */
import { Router } from 'express';
import auth from '../middleware/auth.js';
import { requireInstructor } from '../middleware/roleAuth.js';
import Course from '../models/Course.model.js';
import Document from '../models/Document.model.js';
import StudySession from '../models/StudySession.model.js';
import QuizSession from '../models/QuizSession.model.js';
import User from '../models/User.model.js';

const router = Router();

// ══════════════════════════════════════════════
// COURSE BUILDER
// ══════════════════════════════════════════════

/**
 * GET /api/instructor/courses
 * List all courses created by this instructor.
 */
router.get('/courses', auth, requireInstructor, async (req, res, next) => {
  try {
    const courses = await Course.find({ instructor_id: req.userId })
      .select('-enrollments -modules.document_ids')
      .sort({ updatedAt: -1 })
      .lean();

    const summary = courses.map(c => ({
      _id: c._id,
      title: c.title,
      description: c.description?.slice(0, 120),
      subject: c.subject,
      level: c.level,
      status: c.status,
      moduleCount: c.modules?.length || 0,
      stats: c.stats,
      tags: c.tags,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));

    res.json({ courses: summary, total: summary.length });
  } catch (err) { next(err); }
});

/**
 * POST /api/instructor/courses
 * Create a new course.
 * Body: { title, description, subject, level, tags }
 */
router.post('/courses', auth, requireInstructor, async (req, res, next) => {
  try {
    const { title, description, subject, level, tags } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Course title is required.' });

    const course = await Course.create({
      instructor_id: req.userId,
      title: title.trim(),
      description: description || '',
      subject: subject || 'other',
      level: level || 'all',
      tags: tags || [],
    });

    res.status(201).json({ message: 'Course created', course });
  } catch (err) { next(err); }
});

/**
 * GET /api/instructor/courses/:courseId
 * Get full course detail (with modules, enrollment summary).
 */
router.get('/courses/:courseId', auth, requireInstructor, async (req, res, next) => {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      instructor_id: req.userId,
    }).populate('modules.document_ids', 'title metadata.word_count language')
      .lean();

    if (!course) return res.status(404).json({ error: 'Course not found.' });

    // Compute enrollment stats
    const activeStudents = course.enrollments?.filter(e => e.status === 'active').length || 0;
    const completedStudents = course.enrollments?.filter(e => e.status === 'completed').length || 0;

    res.json({
      ...course,
      enrollments: undefined, // Don't send full enrollment list
      enrollmentSummary: {
        active: activeStudents,
        completed: completedStudents,
        total: course.enrollments?.length || 0,
      },
    });
  } catch (err) { next(err); }
});

/**
 * PUT /api/instructor/courses/:courseId
 * Update course metadata.
 * Body: { title, description, subject, level, tags, status, settings }
 */
router.put('/courses/:courseId', auth, requireInstructor, async (req, res, next) => {
  try {
    const { title, description, subject, level, tags, status, settings } = req.body;

    const course = await Course.findOne({
      _id: req.params.courseId,
      instructor_id: req.userId,
    });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    if (title?.trim()) course.title = title.trim();
    if (description !== undefined) course.description = description;
    if (subject) course.subject = subject;
    if (level) course.level = level;
    if (tags) course.tags = tags;
    if (status && ['draft', 'published', 'archived'].includes(status)) course.status = status;
    if (settings) Object.assign(course.settings, settings);

    await course.save();
    res.json({ message: 'Course updated', course });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/instructor/courses/:courseId
 * Delete a course (only if draft or no active students).
 */
router.delete('/courses/:courseId', auth, requireInstructor, async (req, res, next) => {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      instructor_id: req.userId,
    });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const activeStudents = course.enrollments?.filter(e => e.status === 'active').length || 0;
    if (activeStudents > 0) {
      return res.status(409).json({
        error: `Cannot delete course with ${activeStudents} active student(s). Archive it instead.`,
      });
    }

    await course.deleteOne();
    res.json({ message: 'Course deleted' });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════
// MODULE MANAGEMENT
// ══════════════════════════════════════════════

/**
 * POST /api/instructor/courses/:courseId/modules
 * Add a module to a course.
 * Body: { title, description, document_ids, requirements }
 */
router.post('/courses/:courseId/modules', auth, requireInstructor, async (req, res, next) => {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      instructor_id: req.userId,
    });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const { title, description, document_ids, requirements } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Module title is required.' });

    // Validate document ownership
    if (document_ids?.length) {
      const docs = await Document.find({
        _id: { $in: document_ids },
        user_id: req.userId,
      }).countDocuments();
      if (docs !== document_ids.length) {
        return res.status(400).json({ error: 'Some documents not found or not owned by you.' });
      }
    }

    course.modules.push({
      title: title.trim(),
      description: description || '',
      order: course.modules.length,
      document_ids: document_ids || [],
      requirements: requirements || {},
    });

    await course.save();
    res.status(201).json({
      message: 'Module added',
      module: course.modules[course.modules.length - 1],
    });
  } catch (err) { next(err); }
});

/**
 * PUT /api/instructor/courses/:courseId/modules/:moduleId
 * Update a module.
 */
router.put('/courses/:courseId/modules/:moduleId', auth, requireInstructor, async (req, res, next) => {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      instructor_id: req.userId,
    });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const mod = course.modules.id(req.params.moduleId);
    if (!mod) return res.status(404).json({ error: 'Module not found.' });

    const { title, description, document_ids, requirements, order, is_published } = req.body;
    if (title?.trim()) mod.title = title.trim();
    if (description !== undefined) mod.description = description;
    if (document_ids) mod.document_ids = document_ids;
    if (requirements) Object.assign(mod.requirements, requirements);
    if (order !== undefined) mod.order = order;
    if (is_published !== undefined) mod.is_published = is_published;

    await course.save();
    res.json({ message: 'Module updated', module: mod });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/instructor/courses/:courseId/modules/:moduleId
 * Remove a module from a course.
 */
router.delete('/courses/:courseId/modules/:moduleId', auth, requireInstructor, async (req, res, next) => {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      instructor_id: req.userId,
    });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const idx = course.modules.findIndex(m => m._id.toString() === req.params.moduleId);
    if (idx === -1) return res.status(404).json({ error: 'Module not found.' });

    course.modules.splice(idx, 1);
    // Reorder remaining
    course.modules.forEach((m, i) => { m.order = i; });
    await course.save();

    res.json({ message: 'Module deleted' });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════
// ENROLLMENT MANAGEMENT
// ══════════════════════════════════════════════

/**
 * GET /api/instructor/courses/:courseId/students
 * List all enrolled students with progress.
 */
router.get('/courses/:courseId/students', auth, requireInstructor, async (req, res, next) => {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      instructor_id: req.userId,
    }).populate('enrollments.student_id', 'name email avatar')
      .lean();

    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const students = (course.enrollments || []).map(e => ({
      _id: e._id,
      student: {
        _id: e.student_id?._id,
        name: e.student_id?.name || 'Unknown',
        email: e.student_id?.email || '',
        avatar: e.student_id?.avatar || '',
      },
      status: e.status,
      enrolled_at: e.enrolled_at,
      progress: e.progress,
      grade: e.grade,
    }));

    res.json({ students, total: students.length });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════
// STUDENT ENROLLMENT (Student-facing)
// ══════════════════════════════════════════════

/**
 * POST /api/instructor/courses/:courseId/enroll
 * Student enrolls in a published course.
 */
router.post('/courses/:courseId/enroll', auth, async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.courseId);
    if (!course) return res.status(404).json({ error: 'Course not found.' });
    if (course.status !== 'published') {
      return res.status(400).json({ error: 'Course is not open for enrollment.' });
    }
    if (!course.settings.enrollment_open) {
      return res.status(400).json({ error: 'Enrollment is closed for this course.' });
    }

    // Check already enrolled
    const existing = course.enrollments.find(
      e => e.student_id.toString() === req.userId.toString()
    );
    if (existing) {
      return res.status(409).json({ error: 'Already enrolled in this course.', status: existing.status });
    }

    // Check capacity
    const activeCount = course.enrollments.filter(e => e.status === 'active').length;
    if (activeCount >= course.settings.max_students) {
      return res.status(409).json({ error: 'Course is full.' });
    }

    course.enrollments.push({ student_id: req.userId });
    course.stats.total_enrolled = (course.stats.total_enrolled || 0) + 1;
    await course.save();

    res.status(201).json({ message: 'Successfully enrolled in course.' });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════
// GRADEBOOK
// ══════════════════════════════════════════════

/**
 * GET /api/instructor/courses/:courseId/gradebook
 * Full gradebook: per-student quiz scores, study time, completion.
 */
router.get('/courses/:courseId/gradebook', auth, requireInstructor, async (req, res, next) => {
  try {
    const course = await Course.findOne({
      _id: req.params.courseId,
      instructor_id: req.userId,
    }).populate('enrollments.student_id', 'name email avatar')
      .lean();

    if (!course) return res.status(404).json({ error: 'Course not found.' });

    // Get document IDs from all modules
    const docIds = course.modules.flatMap(m => m.document_ids || []);

    // For each enrolled student, compute grades
    const gradebook = await Promise.all(
      (course.enrollments || []).map(async (enrollment) => {
        const studentId = enrollment.student_id?._id;
        if (!studentId) return null;

        // Get quiz sessions for course documents
        const quizzes = await QuizSession.find({
          user_id: studentId,
          document_id: { $in: docIds },
          status: 'completed',
        }).select('accuracy score total_questions createdAt').lean();

        // Get study sessions
        const sessions = await StudySession.find({
          user_id: studentId,
          document_id: { $in: docIds },
        }).select('session_type duration_seconds').lean();

        const quizAvg = quizzes.length > 0
          ? Math.round(quizzes.reduce((s, q) => s + (q.accuracy || 0), 0) / quizzes.length * 100)
          : 0;

        const totalStudyMin = Math.round(
          sessions.reduce((s, sess) => s + (sess.duration_seconds || 0), 0) / 60
        );

        const completedModules = enrollment.progress?.completed_modules?.length || 0;
        const totalModules = course.modules.length || 1;
        const completionRate = Math.round((completedModules / totalModules) * 100);

        // Assign letter grade
        let letterGrade = 'F';
        if (quizAvg >= 90) letterGrade = 'A';
        else if (quizAvg >= 80) letterGrade = 'B';
        else if (quizAvg >= 70) letterGrade = 'C';
        else if (quizAvg >= 60) letterGrade = 'D';

        return {
          student: {
            _id: enrollment.student_id._id,
            name: enrollment.student_id.name,
            email: enrollment.student_id.email,
            avatar: enrollment.student_id.avatar,
          },
          status: enrollment.status,
          enrolled_at: enrollment.enrolled_at,
          quizzes: {
            count: quizzes.length,
            average_score: quizAvg,
          },
          study: {
            total_minutes: totalStudyMin,
            session_count: sessions.length,
          },
          completion: {
            modules_completed: completedModules,
            total_modules: totalModules,
            percent: completionRate,
          },
          grade: letterGrade,
        };
      })
    );

    res.json({
      courseTitle: course.title,
      gradebook: gradebook.filter(Boolean),
      summary: {
        totalStudents: gradebook.filter(Boolean).length,
        averageGrade: gradebook.filter(Boolean).length > 0
          ? Math.round(gradebook.filter(Boolean).reduce((s, g) => s + g.quizzes.average_score, 0) / gradebook.filter(Boolean).length)
          : 0,
      },
    });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════
// INSTRUCTOR DASHBOARD STATS
// ══════════════════════════════════════════════

/**
 * GET /api/instructor/stats
 * Overview stats for instructor dashboard.
 */
router.get('/stats', auth, requireInstructor, async (req, res, next) => {
  try {
    const courses = await Course.find({ instructor_id: req.userId })
      .select('title status stats enrollments modules')
      .lean();

    const totalCourses = courses.length;
    const publishedCourses = courses.filter(c => c.status === 'published').length;
    const totalStudents = courses.reduce((s, c) =>
      s + (c.enrollments?.filter(e => e.status === 'active').length || 0), 0);
    const totalModules = courses.reduce((s, c) => s + (c.modules?.length || 0), 0);

    // Course breakdown
    const courseBreakdown = courses.map(c => ({
      _id: c._id,
      title: c.title,
      status: c.status,
      students: c.enrollments?.filter(e => e.status === 'active').length || 0,
      modules: c.modules?.length || 0,
      avgQuizScore: c.stats?.average_quiz_score || 0,
      completionRate: c.stats?.average_completion_rate || 0,
    }));

    res.json({
      totalCourses,
      publishedCourses,
      totalStudents,
      totalModules,
      courses: courseBreakdown,
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/instructor/promote
 * Self-promote to instructor role (for development/demo).
 * In production, this would be admin-only.
 */
router.post('/promote', auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (user.role === 'instructor' || user.role === 'admin') {
      return res.json({ message: 'Already has instructor access.', role: user.role });
    }

    user.role = 'instructor';
    await user.save();

    res.json({ message: 'Promoted to instructor role.', role: 'instructor' });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════
// COURSE BROWSING (Student-facing — public)
// ══════════════════════════════════════════════

/**
 * GET /api/instructor/browse
 * Browse published courses (for students).
 */
router.get('/browse', auth, async (req, res, next) => {
  try {
    const { subject, search, page = 1, limit = 12 } = req.query;
    const filter = { status: 'published', 'settings.enrollment_open': true };

    if (subject) filter.subject = subject;
    if (search) filter.$text = { $search: search };

    const skip = (Math.max(1, parseInt(page)) - 1) * Math.min(30, parseInt(limit) || 12);
    const pageLimit = Math.min(30, parseInt(limit) || 12);

    const [courses, total] = await Promise.all([
      Course.find(filter)
        .select('title description subject level tags stats modules instructor_id settings.max_students createdAt')
        .populate('instructor_id', 'name avatar')
        .sort({ 'stats.total_enrolled': -1 })
        .skip(skip).limit(pageLimit)
        .lean(),
      Course.countDocuments(filter),
    ]);

    const results = courses.map(c => ({
      _id: c._id,
      title: c.title,
      description: c.description?.slice(0, 200),
      subject: c.subject,
      level: c.level,
      tags: c.tags,
      moduleCount: c.modules?.length || 0,
      enrolled: c.stats?.total_enrolled || 0,
      maxStudents: c.settings?.max_students || 100,
      instructor: {
        name: c.instructor_id?.name || 'Unknown',
        avatar: c.instructor_id?.avatar || '',
      },
      // Check if current user is enrolled
      isEnrolled: false, // Computed client-side or via separate endpoint
    }));

    res.json({
      courses: results,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / pageLimit),
    });
  } catch (err) { next(err); }
});

export default router;
