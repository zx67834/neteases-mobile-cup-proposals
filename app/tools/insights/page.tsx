import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { TeacherInsightsTool } from '@/components/campus/tools/InsightsTools';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'teacher') redirect('/tools');
  return (
    <>
      <TeacherInsightsTool />
      <AccountDock displayName={session.displayName || session.username} role="教师" />
    </>
  );
}
