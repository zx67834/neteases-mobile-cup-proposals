import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { LessonPlanTool } from '@/components/campus/tools/LessonPlanTool';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'teacher') redirect('/tools');
  return (
    <>
      <LessonPlanTool />
      <AccountDock displayName={session.displayName || session.username} role="教师" />
    </>
  );
}
