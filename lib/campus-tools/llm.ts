/**
 * Lightweight OpenAI-compatible chat for campus tools.
 * Tries Qwen → DeepSeek → OpenAI; falls back if a provider's network call fails.
 */

type Provider = { name: string; apiKey: string; baseUrl: string; model: string };

function listProviders(): Provider[] {
  const out: Provider[] = [];
  const qwen = process.env.QWEN_API_KEY?.trim();
  const deepseek = process.env.DEEPSEEK_API_KEY?.trim();
  const openai = process.env.OPENAI_API_KEY?.trim();

  if (qwen) {
    out.push({
      name: 'qwen',
      apiKey: qwen,
      baseUrl: (process.env.QWEN_BASE_URL?.trim() || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(
        /\/$/,
        '',
      ),
      model: 'qwen-plus',
    });
  }
  if (deepseek) {
    out.push({
      name: 'deepseek',
      apiKey: deepseek,
      baseUrl: (process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com').replace(/\/$/, ''),
      model: 'deepseek-chat',
    });
  }
  if (openai) {
    out.push({
      name: 'openai',
      apiKey: openai,
      baseUrl: (process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1').replace(/\/$/, ''),
      model: 'gpt-4o-mini',
    });
  }
  return out;
}

async function chatOnce(
  provider: Provider,
  system: string,
  user: string,
  options: { json?: boolean; temperature?: number },
): Promise<string> {
  const insecure =
    process.env.LLM_TLS_INSECURE?.trim().toLowerCase() === 'true' ||
    process.env.LLM_TLS_INSECURE?.trim() === '1' ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0';

  let response: Response;
  if (insecure) {
    const { Agent, fetch: undiciFetch } = await import(/* webpackIgnore: true */ 'undici');
    const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });
    response = (await undiciFetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: options.temperature ?? 0.4,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      dispatcher,
    })) as unknown as Response;
  } else {
    response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: options.temperature ?? 0.4,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${provider.name} 调用失败 (${response.status}): ${detail.slice(0, 240)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`${provider.name} 返回为空`);
  return content;
}

export async function campusToolsChat(
  system: string,
  user: string,
  options: { json?: boolean; temperature?: number } = {},
): Promise<string> {
  const providers = listProviders();
  if (!providers.length) {
    throw new Error('未配置 QWEN_API_KEY / DEEPSEEK_API_KEY / OPENAI_API_KEY，无法调用模型');
  }

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      return await chatOnce(provider, system, user, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[CampusToolsLLM] ${provider.name} failed:`, message);
      errors.push(`${provider.name}: ${message}`);
    }
  }

  throw new Error(`所有模型均不可用。${errors.join(' | ')}`);
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  return JSON.parse(raw);
}
