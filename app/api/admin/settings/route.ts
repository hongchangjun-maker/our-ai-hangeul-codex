import { z } from 'zod';
import { getModels, getRuntimeSettings, hasStoredOpenAIKey, saveOpenAIKey, saveRuntimeSettings } from '../../../server/settings';
import { isAdmin, isJsonRequest, json, validSameOrigin } from '../../../server/security';
import { BUNDLED_FONT_FAMILIES } from '../../../domain/font-families';

export const dynamic = 'force-dynamic';

const schema = z.object({
  model: z.enum(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']),
  reasoning: z.enum(['none', 'low', 'medium', 'high']),
  maxOutputTokens: z.number().int().min(128).max(16_000),
  autoRouting: z.boolean(),
  defaultFont: z.enum(BUNDLED_FONT_FAMILIES),
  autosaveDelayMs: z.number().int().min(500).max(10_000),
  apiKey: z.string().min(20).max(500).optional(),
});

export async function GET(request: Request) {
  if (!await isAdmin(request)) return json({ code: 'UNAUTHORIZED' }, 401);
  const [settings, models, hasApiKey] = await Promise.all([getRuntimeSettings(), getModels(), hasStoredOpenAIKey()]);
  return json({ settings: { ...settings, hasApiKey }, models });
}

export async function PUT(request: Request) {
  if (!await isAdmin(request)) return json({ code: 'UNAUTHORIZED', message: '관리자 인증이 필요합니다.' }, 401);
  if (!validSameOrigin(request) || !isJsonRequest(request)) return json({ code: 'INVALID_REQUEST', message: '허용되지 않은 요청입니다.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 4096) return json({ code: 'REQUEST_TOO_LARGE', message: '요청이 너무 큽니다.' }, 413);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ code: 'VALIDATION_ERROR', message: '설정값을 확인해 주세요.' }, 400);
  const { apiKey, ...settings } = parsed.data;
  try {
    if (apiKey) await saveOpenAIKey(apiKey);
    await saveRuntimeSettings(settings);
    return json({ message: '설정을 저장했습니다.', settings: { ...settings, hasApiKey: apiKey ? true : await hasStoredOpenAIKey() } });
  } catch (reason) {
    const message = reason instanceof Error && reason.message.includes('SETTINGS_ENCRYPTION_KEY') ? 'AI 키 암호화용 서버 비밀값이 설정되지 않았습니다.' : '설정을 저장하지 못했습니다.';
    return json({ code: 'SETTINGS_SAVE_FAILED', message }, 503);
  }
}
