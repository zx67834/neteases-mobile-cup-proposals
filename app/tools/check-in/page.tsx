import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { CheckinTool } from '@/components/campus/tools/CheckinTool';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'teacher' && session.role !== 'student') redirect('/tools');
  const dock = session.role === 'teacher' ? '教师' : '学生';
  return (
    <>
      <CheckinTool role={session.role} />
      <AccountDock displayName={session.displayName || session.username} role={dock} />
    </>
  );
}
