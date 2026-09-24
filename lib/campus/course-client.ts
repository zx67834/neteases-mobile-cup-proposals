import type { StageListItem } from '@/lib/utils/stage-storage';

export interface StudentCampusCourse extends StageListItem {
  courseId: string;
  status: 'draft' | 'published' | 'archived';
  teacherName: string;
  className?: string;
}

/**
 * The single student-facing course source.
 *
 * It only returns courses that belong to the current student's active
 * enrollments and have been published by the teacher. Student home, classroom
 * entry points and the learning workflow must all use this boundary instead
 * of owner-scoped teacher library listings.
 */
export async function listStudentCampusCourses(): Promise<StudentCampusCourse[]> {
  const response = await fetch('/api/campus/courses', {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    records?: StudentCampusCourse[];
    error?: string;
  };
  if (!response.ok || !payload.success || !Array.isArray(payload.records)) {
    throw new Error(payload.error || '课程列表加载失败');
  }
  return payload.records;
}
