import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { getServerPersistenceProvider } from '@/lib/persistence/server-provider';

export const CAMPUS_DEEPSEEK_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'deepseek-v4-flash-vision-exp',
] as const;
export type CampusDeepSeekModel = (typeof CAMPUS_DEEPSEEK_MODELS)[number];
export const DEFAULT_CAMPUS_MODEL: CampusDeepSeekModel = 'deepseek-v4-flash';

type SettingsRow = {
  model_id: string;
  api_key_ciphertext: string | null;
  role: string;
};

async function pool() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required for account settings');
  return (await getServerPersistenceProvider(databaseUrl)).pool;
}

function encryptionKey(): Buffer {
  const value = process.env.CAMPUS_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!value || !/^[a-f\d]{64}$/i.test(value)) {
    throw new Error('CAMPUS_CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex key');
  }
  return Buffer.from(value, 'hex');
}

function encryptKey(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url')).join('.');
}

function decryptKey(value: string): string {
  const [iv, tag, ciphertext] = value.split('.');
  if (!iv || !tag || !ciphertext) throw new Error('Stored credential is malformed');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export async function getCampusModelSettings(userId: string) {
  const result = await (
    await pool()
  ).query<SettingsRow>(
    `SELECT settings.model_id, settings.api_key_ciphertext, users.role
       FROM campus_users users
       LEFT JOIN campus_user_model_settings settings ON settings.user_id = users.id
      WHERE users.id = $1`,
    [userId],
  );
  const row = result.rows[0];
  const defaultModel = row?.role === 'teacher' ? 'deepseek-v4-pro' : DEFAULT_CAMPUS_MODEL;
  const modelId = CAMPUS_DEEPSEEK_MODELS.includes(row?.model_id as CampusDeepSeekModel)
    ? (row.model_id as CampusDeepSeekModel)
    : defaultModel;
  return {
    providerId: 'deepseek' as const,
    modelId,
    hasPersonalKey: Boolean(row?.api_key_ciphertext),
    hasAvailableKey: Boolean(row?.api_key_ciphertext || process.env.DEEPSEEK_API_KEY?.trim()),
    apiKey: row?.api_key_ciphertext
      ? decryptKey(row.api_key_ciphertext)
      : (process.env.DEEPSEEK_API_KEY?.trim() ?? ''),
  };
}

export async function saveCampusModelSettings(
  userId: string,
  input: { modelId: CampusDeepSeekModel; apiKey?: string; resetKey?: boolean },
): Promise<void> {
  const ciphertext = input.apiKey ? encryptKey(input.apiKey) : null;
  await (
    await pool()
  ).query(
    `INSERT INTO campus_user_model_settings (user_id, model_id, api_key_ciphertext)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET
       model_id = EXCLUDED.model_id,
       api_key_ciphertext = CASE
         WHEN $4::boolean THEN NULL
         WHEN $3::text IS NOT NULL THEN EXCLUDED.api_key_ciphertext
         ELSE campus_user_model_settings.api_key_ciphertext
       END,
       updated_at = now()`,
    [userId, input.modelId, ciphertext, Boolean(input.resetKey)],
  );
}
