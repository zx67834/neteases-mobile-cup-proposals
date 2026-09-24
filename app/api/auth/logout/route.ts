import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import {
  CAMPUS_SESSION_COOKIE,
  revokeCampusSession,
  sessionCookieOptions,
} from '@/lib/auth/campus-auth';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  await revokeCampusSession(request.cookies.get(CAMPUS_SESSION_COOKIE)?.value ?? null);
  const response = NextResponse.json({ success: true });
  response.cookies.set(CAMPUS_SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
  return response;
}
