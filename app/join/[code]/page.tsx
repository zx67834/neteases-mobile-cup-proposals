import { redirect } from 'next/navigation';

import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function JoinCoursePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = code.trim().toUpperCase();
  const session = await getCurrentCampusSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/join/${normalized}`)}`);
  if (session.role !== 'student') redirect(session.role === 'teacher' ? '/teacher' : '/admin');
  redirect(`/student?join=${encodeURIComponent(normalized)}`);
}
