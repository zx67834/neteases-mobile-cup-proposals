import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { OralTool } from '@/components/campus/tools/OralTool';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'student') redirect('/tools');
  return (
    <>
      <OralTool />
      <AccountDock displayName={session.displayName || session.username} role="学生" />
    </>
  );
}
