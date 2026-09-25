import { callLLM } from '@/lib/ai/llm';
import { getCampusSessionFromRequest } from '@/lib/auth/campus-auth';
import {
  CAMPUS_DEEPSEEK_MODELS,
  getCampusModelSettings,
  type CampusDeepSeekModel,
} from '@/lib/auth/campus-model-settings';
import { withCampusModelContext } from '@/lib/auth/campus-model-context';
import { apiError } from '@/lib/server/api-response';
import { resolveModel } from '@/lib/server/resolve-model';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return apiError('FORBIDDEN', 403, '请求来源无效');
  }
  const session = await getCampusSessionFromRequest(request);
  if (!session) return apiError('UNAUTHENTICATED', 401, '请先登录');
  if (session.role === 'admin') return apiError('FORBIDDEN', 403, '教务账号暂不使用个人模型');

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, '测试配置格式无效');
  }
  if (!input || typeof input !== 'object') {
    return apiError('INVALID_REQUEST', 400, '测试配置格式无效');
  }
  const fields = input as Record<string, unknown>;
  const modelId = fields.modelId;
  if (!CAMPUS_DEEPSEEK_MODELS.includes(modelId as CampusDeepSeekModel)) {
    return apiError('INVALID_REQUEST', 400, '请选择支持的 DeepSeek 模型');
  }
  const candidateKey = typeof fields.apiKey === 'string' ? fields.apiKey.trim() : '';
  if (candidateKey && (candidateKey.length > 500 || !candidateKey.startsWith('sk-'))) {
    return apiError('INVALID_REQUEST', 400, '请输入有效的 DeepSeek API Key');
  }

  try {
    const saved = await getCampusModelSettings(session.id);
    const apiKey = candidateKey || saved.apiKey;
    if (!apiKey) return apiError('MISSING_API_KEY', 400, '请先填写或保存 API Key');
    const result = await withCampusModelContext(
      { modelString: `deepseek/${modelId}`, apiKey },
      () => resolveModel({ modelString: `deepseek/${modelId}` }),
    );
    await callLLM(
      { model: result.model, prompt: 'Reply with OK.', maxOutputTokens: 32 },
      'verify-model',
      undefined,
      { mode: 'disabled', enabled: false },
    );
    return Response.json({ success: true, message: '连接成功，模型可以正常响应' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/401|unauthorized|invalid api key/i.test(message)) {
      return apiError('INVALID_CREDENTIALS', 502, 'API Key 无效或已过期');
    }
    if (/404|model not found/i.test(message)) {
      return apiError('MISSING_MODEL', 502, '模型不可用，请换一个模型再试');
    }
    if (/429|rate limit/i.test(message)) {
      return apiError('RATE_LIMITED', 502, '服务商限流，请稍后重试');
    }
    if (/cannot connect|econnrefused|enotfound|fetch failed|network|timeout/i.test(message)) {
      return apiError('UPSTREAM_ERROR', 502, '无法连接 DeepSeek 接口，请检查服务器网络');
    }
    return apiError('UPSTREAM_ERROR', 502, '连接失败，请检查网络或稍后重试');
  }
}
