import { redirect } from 'next/navigation';

import { AccountDock } from '@/components/auth/AccountDock';
import { AdminOverviewTool } from '@/components/campus/tools/InsightsTools';
import { getCurrentCampusSession } from '@/lib/auth/campus-auth';

export default async function Page() {
  const session = await getCurrentCampusSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin') redirect('/tools');
  return (
    <>
      <AdminOverviewTool />
      <AccountDock displayName={session.displayName || session.username} role="行政" />
    </>
  );
}
