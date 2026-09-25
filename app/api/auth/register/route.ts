import { NextResponse } from 'next/server';

import {
  CAMPUS_SESSION_COOKIE,
  campusHomeForRole,
  createCampusSession,
  registerCampusUser,
  sessionCookieOptions,
  type CampusRole,
} from '@/lib/auth/campus-auth';
import { apiError } from '@/lib/server/api-response';

export const runtime = 'nodejs';

const USERNAME_PATTERN = /^[a-zA-Z0-9_\-]{3,32}$/;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, '注册信息格式无效');
  }
  const input = body as Record<string, unknown>;
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
  const realName = typeof input.realName === 'string' ? input.realName.trim() : '';
  const role = input.role as CampusRole;
  if (!USERNAME_PATTERN.test(username)) {
    return apiError('INVALID_REQUEST', 400, '账号需为 3—32 位字母、数字、下划线或短横线');
  }
  if (password.length < 8 || password.length > 200) {
    return apiError('INVALID_REQUEST', 400, '密码至少需要 8 位');
  }
  if (
    !displayName ||
    displayName.length > 50 ||
    realName.length > 50 ||
    (role !== 'teacher' && role !== 'student')
  ) {
    return apiError('INVALID_REQUEST', 400, '姓名或身份无效');
  }

  try {
    const user = await registerCampusUser({ username, password, displayName, realName, role });
    const session = await createCampusSession(user);
    const response = NextResponse.json(
      { success: true, user, redirectTo: campusHomeForRole(user.role) },
      { status: 201 },
    );
    response.cookies.set(CAMPUS_SESSION_COOKIE, session.token, {
      ...sessionCookieOptions(),
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return apiError('CONFLICT', 409, '这个账号已经被使用');
    }
    console.error('[CampusAuth] Registration failed', error);
    return apiError('INTERNAL_ERROR', 500, '注册服务暂时不可用');
  }
}
