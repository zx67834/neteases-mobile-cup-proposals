import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { PracticeTool } from '@/components/campus/tools/PracticeTool';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'student') redirect('/tools');
  return (
    <>
      <PracticeTool />
      <AccountDock displayName={session.displayName || session.username} role="学生" />
    </>
  );
}
