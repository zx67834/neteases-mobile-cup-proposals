import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { StudentInsightsTool } from '@/components/campus/tools/InsightsTools';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'student') redirect('/tools');
  return (
    <>
      <StudentInsightsTool />
      <AccountDock displayName={session.displayName || session.username} role="学生" />
    </>
  );
}
