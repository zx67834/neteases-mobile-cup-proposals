import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { OpsTool } from '@/components/campus/tools/AdminTools';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role === 'student') redirect('/tools');
  const dock =
    session.role === 'admin' ? '行政' : session.role === 'teacher' ? '教师' : '学生';
  return (
    <>
      <OpsTool isAdmin={session.role === 'admin'} />
      <AccountDock displayName={session.displayName || session.username} role={dock} />
    </>
  );
}
