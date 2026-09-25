import {
  changeCampusPassword,
  getCampusSessionFromRequest,
  updateCampusProfile,
} from '@/lib/auth/campus-auth';
import {
  CAMPUS_DEEPSEEK_MODELS,
  getCampusModelSettings,
  saveCampusModelSettings,
  type CampusDeepSeekModel,
} from '@/lib/auth/campus-model-settings';
import { apiError } from '@/lib/server/api-response';

export const runtime = 'nodejs';

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function GET(request: Request) {
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHENTICATED', 401, '请先登录');
  const model = await getCampusModelSettings(session.id);
  return Response.json({
    user: {
      username: session.username,
      displayName: session.displayName,
      realName: session.realName,
      role: session.role,
    },
    model: {
      providerId: model.providerId,
      modelId: model.modelId,
      hasPersonalKey: model.hasPersonalKey,
      hasAvailableKey: model.hasAvailableKey,
    },
  });
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return apiError('FORBIDDEN', 403, '请求来源无效');
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHENTICATED', 401, '请先登录');

  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('INVALID_REQUEST', 400, '账号设置格式无效');
  }
  try {
    if (input.section === 'profile') {
      const username = typeof input.username === 'string' ? input.username.trim() : '';
      const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : '';
      const realName = typeof input.realName === 'string' ? input.realName.trim() : '';
      if (
        !/^[a-zA-Z0-9_-]{3,32}$/.test(username) ||
        !displayName ||
        displayName.length > 50 ||
        realName.length > 50
      ) {
        return apiError('INVALID_REQUEST', 400, '账号、显示名称或真实姓名不符合要求');
      }
      const user = await updateCampusProfile(session.id, { username, displayName, realName });
      return Response.json({ success: true, user });
    }
    if (input.section === 'model') {
      const modelId = input.modelId;
      if (!CAMPUS_DEEPSEEK_MODELS.includes(modelId as CampusDeepSeekModel)) {
        return apiError('INVALID_REQUEST', 400, '请选择支持的 DeepSeek 模型');
      }
      const apiKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
      if (apiKey && (apiKey.length > 500 || !apiKey.startsWith('sk-'))) {
        return apiError('INVALID_REQUEST', 400, '请输入有效的 DeepSeek API Key');
      }
      const resetKey = input.resetKey === true;
      if (apiKey && resetKey) return apiError('INVALID_REQUEST', 400, '不能同时设置与清除 API Key');
      await saveCampusModelSettings(session.id, {
        modelId: modelId as CampusDeepSeekModel,
        ...(apiKey ? { apiKey } : {}),
        resetKey,
      });
      return Response.json({ success: true });
    }
    if (input.section === 'password') {
      const currentPassword =
        typeof input.currentPassword === 'string' ? input.currentPassword : '';
      const newPassword = typeof input.newPassword === 'string' ? input.newPassword : '';
      if (!currentPassword || newPassword.length < 8 || newPassword.length > 200) {
        return apiError('INVALID_REQUEST', 400, '新密码需要 8—200 位');
      }
      const changed = await changeCampusPassword(
        session.id,
        session.sessionId,
        currentPassword,
        newPassword,
      );
      if (!changed) return apiError('INVALID_CREDENTIALS', 400, '当前密码不正确');
      return Response.json({ success: true });
    }
    return apiError('INVALID_REQUEST', 400, '未知的设置类型');
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return apiError('CONFLICT', 409, '这个账号已经被使用');
    }
    if (error instanceof Error && error.message.startsWith('CAMPUS_CREDENTIAL_ENCRYPTION_KEY')) {
      return apiError('INTERNAL_ERROR', 503, '服务器尚未配置独立密钥的加密设置');
    }
    console.error('[CampusAccount] Update failed', error);
    return apiError('INTERNAL_ERROR', 500, '账号设置暂时无法保存');
  }
}
