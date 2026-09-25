import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { QuizBuilderTool } from '@/components/campus/tools/QuizBuilderTool';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'teacher') redirect('/tools');
  return (
    <>
      <QuizBuilderTool />
      <AccountDock displayName={session.displayName || session.username} role="教师" />
    </>
  );
}
