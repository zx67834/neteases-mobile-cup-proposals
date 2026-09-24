import { redirect } from 'next/navigation';

import { MessageCenter } from '@/components/campus/MessageCenter';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function MessagesPage() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role === 'admin') redirect('/admin');
  return <MessageCenter homeHref={session.role === 'teacher' ? '/teacher' : '/student'} />;
}
