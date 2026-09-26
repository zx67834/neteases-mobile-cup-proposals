import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { SharedLessonsTool } from '@/components/campus/tools/LessonPlanTool';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'student' && session.role !== 'admin') redirect('/tools');
  const roleLabel =
    session.role === 'admin' ? '行政' : session.role === 'student' ? '学生' : '教师';
  return (
    <>
      <SharedLessonsTool />
      <AccountDock displayName={session.displayName || session.username} role={roleLabel} />
    </>
  );
}
