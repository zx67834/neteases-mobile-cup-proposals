import { redirect } from 'next/navigation';

import { LoginPanel } from '@/components/auth/LoginPanel';
import { campusHomeForRole, getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function LoginPage() {
  const session = await getCurrentCampusSession();
  if (session) redirect(campusHomeForRole(session.role));
  return <LoginPanel />;
}
