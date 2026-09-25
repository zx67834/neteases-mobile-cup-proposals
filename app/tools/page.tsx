import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { ToolsCenter } from '@/components/campus/ToolsCenter';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

const DOCK_ROLE: Record<'teacher' | 'student' | 'admin', string> = {
  teacher: '教师',
  student: '学生',
  admin: '行政',
};

export default async function ToolsPage() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');

  return (
    <>
      <ToolsCenter
        role={session.role}
        displayName={session.displayName || session.username}
      />
      <AccountDock
        displayName={session.displayName || session.username}
        role={DOCK_ROLE[session.role]}
      />
    </>
  );
}
