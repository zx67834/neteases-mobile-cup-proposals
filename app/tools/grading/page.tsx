import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { GradingTool } from '@/components/campus/tools/GradingTool';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'teacher') redirect('/tools');
  return (
    <>
      <GradingTool />
      <AccountDock displayName={session.displayName || session.username} role="教师" />
    </>
  );
}
