import 'server-only';

import { callLLM } from '@/lib/ai/llm';
import { getCampusModelSettings } from '@/lib/auth/campus-model-settings';
import { withCampusModelContext } from '@/lib/auth/campus-model-context';
import { resolveModel } from '@/lib/server/resolve-model';

/**
 * Resolve campus-tool generation through the same account-scoped model path as
 * classroom chat. Teacher and student tools therefore use the model and
 * encrypted API key selected by the current account.
 */
export async function campusToolsChat(
  userId: string,
  system: string,
  user: string,
  options: { json?: boolean; temperature?: number } = {},
): Promise<string> {
  const settings = await getCampusModelSettings(userId);
  if (!settings.apiKey) {
    throw new Error('当前账号尚未配置可用的模型 API Key，请先前往账号设置完成配置');
  }

  const modelString = `${settings.providerId}:${settings.modelId}`;
  return withCampusModelContext({ modelString, apiKey: settings.apiKey }, async () => {
    const resolved = await resolveModel({ modelString });
    const result = await callLLM(
      {
        model: resolved.model,
        system,
        prompt: user,
        temperature: options.temperature ?? 0.4,
        maxOutputTokens: options.json ? 4096 : 8192,
      },
      'campus-tools',
      options.json ? { retries: 1 } : undefined,
      resolved.thinkingConfig,
    );
    const content = result.text.trim();
    if (!content) throw new Error('模型返回为空');
    return content;
  });
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  return JSON.parse(raw);
}
