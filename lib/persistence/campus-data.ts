import type { Queryable } from '@openmaic/storage/document/pg';

import type { CampusSession } from '@/lib/auth/campus-auth';

export interface CampusCourseListItem {
  id: string;
  courseId: string;
  name: string;
  description?: string;
  sceneCount: number;
  createdAt: number;
  updatedAt: number;
  status: 'draft' | 'published' | 'archived';
  teacherName: string;
  className?: string;
  inviteCode?: string;
}

interface CampusCourseRow extends Record<string, unknown> {
  stage_id: string;
  course_id: string;
  title: string;
  description: string;
  scene_count: number | string;
  created_at_ms: number | string;
  updated_at_ms: number | string;
  status: CampusCourseListItem['status'];
  teacher_name: string;
  class_name: string | null;
  invite_code: string | null;
}

function mapCourse(row: CampusCourseRow): CampusCourseListItem {
  return {
    id: row.stage_id,
    courseId: row.course_id,
    name: row.title,
    ...(row.description ? { description: row.description } : {}),
    sceneCount: Number(row.scene_count),
    createdAt: Number(row.created_at_ms),
    updatedAt: Number(row.updated_at_ms),
    status: row.status,
    teacherName: row.teacher_name,
    ...(row.class_name ? { className: row.class_name } : {}),
    ...(row.invite_code ? { inviteCode: row.invite_code } : {}),
  };
}

export async function listCampusCourses(
  queryable: Queryable,
  session: CampusSession,
): Promise<CampusCourseListItem[]> {
  const roleFilter =
    session.role === 'student'
      ? `JOIN campus_course_enrollments e ON e.course_id = c.id
         AND e.student_id = $1 AND e.status = 'active'
         WHERE c.status = 'published'`
      : `WHERE c.teacher_id = $1`;
  const result = await queryable.query<CampusCourseRow>(
    `SELECT c.stage_id, c.id AS course_id, c.title, c.description, c.status,
            COALESCE(ds.scene_count, 0) AS scene_count,
            EXTRACT(EPOCH FROM c.created_at) * 1000 AS created_at_ms,
            GREATEST(EXTRACT(EPOCH FROM c.updated_at) * 1000, COALESCE(d.updated_at, 0)) AS updated_at_ms,
            t.display_name AS teacher_name, cl.name AS class_name, cl.invite_code
       FROM campus_courses c
       JOIN campus_users t ON t.id = c.teacher_id
       JOIN document_stages d ON d.id = c.stage_id
       LEFT JOIN campus_classes cl ON cl.id = c.class_id
       LEFT JOIN (
         SELECT stage_id, count(*)::int AS scene_count FROM document_scenes GROUP BY stage_id
       ) ds ON ds.stage_id = c.stage_id
       ${roleFilter}
      ORDER BY c.updated_at DESC`,
    [session.id],
  );
  return result.rows.map(mapCourse);
}

export async function ensureTeacherClass(
  queryable: Queryable,
  teacher: Pick<CampusSession, 'id' | 'displayName'>,
): Promise<{ id: string; inviteCode: string }> {
  const result = await queryable.query<{ id: string; invite_code: string }>(
    `INSERT INTO campus_classes (id, teacher_id, name, invite_code)
     VALUES ('class_' || $1, $1, $2 || '的班级', upper(substr(md5($1), 1, 8)))
     ON CONFLICT (id) DO UPDATE SET updated_at = now()
     RETURNING id, invite_code`,
    [teacher.id, teacher.displayName || '教师'],
  );
  return { id: result.rows[0].id, inviteCode: result.rows[0].invite_code };
}

export async function syncCampusCourseForStage(
  queryable: Queryable,
  teacher: Pick<CampusSession, 'id' | 'displayName'>,
  stageId: string,
): Promise<void> {
  const teacherClass = await ensureTeacherClass(queryable, teacher);
  await queryable.query(
    `INSERT INTO campus_courses
       (id, teacher_id, class_id, stage_id, title, description, status, content_rev, created_at, updated_at)
     SELECT 'course_' || d.id, $1, $2, d.id, d.name, COALESCE(d.description, ''),
            CASE WHEN COALESCE(m.is_public, FALSE) THEN 'published' ELSE 'draft' END,
            1, to_timestamp(d.created_at / 1000.0), to_timestamp(d.updated_at / 1000.0)
       FROM document_stages d
       LEFT JOIN stage_meta m ON m.stage_id = d.id
      WHERE d.id = $3
     ON CONFLICT (teacher_id, stage_id) WHERE stage_id IS NOT NULL DO UPDATE SET
       class_id = COALESCE(campus_courses.class_id, EXCLUDED.class_id),
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       updated_at = EXCLUDED.updated_at`,
    [teacher.id, teacherClass.id, stageId],
  );
}

export async function setCampusCoursePublished(
  queryable: Queryable,
  teacherId: string,
  stageId: string,
  published: boolean,
): Promise<void> {
  const result = await queryable.query<{ id: string; class_id: string | null }>(
    `UPDATE campus_courses
        SET status = $3, published_at = CASE WHEN $3 = 'published' THEN now() ELSE NULL END,
            content_rev = content_rev + 1, updated_at = now()
      WHERE teacher_id = $1 AND stage_id = $2
      RETURNING id, class_id`,
    [teacherId, stageId, published ? 'published' : 'draft'],
  );
  const course = result.rows[0];
  if (published && course?.class_id) {
    await queryable.query(
      `INSERT INTO campus_course_enrollments (course_id, student_id, source)
       SELECT $1, student_id, 'class_sync'
         FROM campus_class_members
        WHERE class_id = $2 AND status = 'active'
       ON CONFLICT (course_id, student_id) DO UPDATE SET status = 'active', updated_at = now()`,
      [course.id, course.class_id],
    );
  }
}

export async function joinCampusClass(
  queryable: Queryable,
  studentId: string,
  inviteCode: string,
): Promise<{ className: string; courseCount: number } | null> {
  const classResult = await queryable.query<{ id: string; name: string }>(
    `SELECT id, name FROM campus_classes
      WHERE upper(invite_code) = upper($1) AND is_active = TRUE LIMIT 1`,
    [inviteCode],
  );
  const campusClass = classResult.rows[0];
  if (!campusClass) return null;
  await queryable.query(
    `INSERT INTO campus_class_members (class_id, student_id, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (class_id, student_id) DO UPDATE SET status = 'active', updated_at = now()`,
    [campusClass.id, studentId],
  );
  const enrollment = await queryable.query(
    `INSERT INTO campus_course_enrollments (course_id, student_id, source)
     SELECT id, $2, 'class_sync' FROM campus_courses
      WHERE class_id = $1 AND status = 'published'
     ON CONFLICT (course_id, student_id) DO UPDATE SET status = 'active', updated_at = now()
     RETURNING course_id`,
    [campusClass.id, studentId],
  );
  return { className: campusClass.name, courseCount: enrollment.rows.length };
}

export async function canStudentAccessStage(
  queryable: Queryable,
  studentId: string,
  stageId: string,
): Promise<boolean> {
  const result = await queryable.query(
    `SELECT 1 FROM campus_course_enrollments e
      JOIN campus_courses c ON c.id = e.course_id
     WHERE e.student_id = $1 AND e.status = 'active'
       AND c.stage_id = $2 AND c.status = 'published'
     LIMIT 1`,
    [studentId, stageId],
  );
  return result.rows.length > 0;
}
