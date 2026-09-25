import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { PracticeSession } from '@/components/campus/tools/PracticeTool';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'student') redirect('/tools');
  const { quizId } = await params;
  return (
    <>
      <PracticeSession quizId={quizId} />
      <AccountDock displayName={session.displayName || session.username} role="学生" />
    </>
  );
}
