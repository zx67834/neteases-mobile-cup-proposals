import { NextResponse } from 'next/server';

import {
  CAMPUS_SESSION_COOKIE,
  anonymousOwnerFromRequest,
  campusHomeForRole,
  createCampusSession,
  migrateAnonymousDataForLogin,
  sessionCookieOptions,
  verifyCampusCredentials,
} from '@/lib/auth/campus-auth';
import { apiError } from '@/lib/server/api-response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, '登录信息格式无效');
  }
  const input = body as { username?: unknown; password?: unknown };
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!username || username.length > 80 || !password || password.length > 200) {
    return apiError('INVALID_REQUEST', 400, '请输入有效的账号和密码');
  }

  try {
    const user = await verifyCampusCredentials(username, password, {
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent'),
    });
    if (!user) return apiError('UNAUTHORIZED', 401, '账号或密码不正确');

    await migrateAnonymousDataForLogin(user, anonymousOwnerFromRequest(request));
    const session = await createCampusSession(user);
    const response = NextResponse.json({
      success: true,
      user,
      redirectTo: campusHomeForRole(user.role),
    });
    response.cookies.set(CAMPUS_SESSION_COOKIE, session.token, {
      ...sessionCookieOptions(),
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    console.error('[CampusAuth] Login failed', error);
    return apiError('INTERNAL_ERROR', 500, '登录服务暂时不可用');
  }
}
