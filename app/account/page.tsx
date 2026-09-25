import { redirect } from 'next/navigation';

import { AccountSettings } from '@/components/auth/AccountSettings';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function AccountPage() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login?next=/account');
  return <AccountSettings />;
}
