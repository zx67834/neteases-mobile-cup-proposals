import { redirect } from 'next/navigation';

import { getCurrentCampusSession } from '@/lib/auth/campus-auth';
import { AccountDock } from '@/components/auth/AccountDock';
import { ensureTeacherClass } from '@/lib/persistence/campus-data';
import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'teacher' && session.role !== 'admin') redirect('/student');
  const teacherClass =
    session.role === 'teacher'
      ? await ensureTeacherClass(
          (await getServerPersistenceProvider(process.env.DATABASE_URL ?? '')).pool,
          session,
        )
      : null;
  return (
    <>
      {children}
      <AccountDock
        displayName={session.displayName || session.username}
        role="教师"
        inviteCode={teacherClass?.inviteCode}
      />
    </>
  );
}
