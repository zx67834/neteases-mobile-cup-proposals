import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return Response.json({ authenticated: false }, { status: 401 });
  return Response.json({
    authenticated: true,
    user: {
      id: session.id,
      username: session.username,
      displayName: session.displayName,
      role: session.role,
    },
  });
}
