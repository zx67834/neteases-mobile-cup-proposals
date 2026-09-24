import { redirect } from 'next/navigation';

import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'student' && session.role !== 'admin') redirect('/teacher');
  return children;
}
