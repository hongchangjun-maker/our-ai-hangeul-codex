import { z } from 'zod';
import { testOpenAI } from '../../../server/ai-provider';
import { getOpenAIKey } from '../../../server/settings';
import { isAdmin, isJsonRequest, json, validSameOrigin } from '../../../server/security';

const schema = z.object({ apiKey: z.string().min(20).max(500).optional(), model: z.enum(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']) });

export async function POST(request: Request) {
  if (!await isAdmin(request)) return json({ code: 'UNAUTHORIZED', message: '관리자 인증이 필요합니다.' }, 401);
  if (!validSameOrigin(request) || !isJsonRequest(request)) return json({ code: 'INVALID_REQUEST', message: '허용되지 않은 요청입니다.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 4096) return json({ code: 'REQUEST_TOO_LARGE', message: '요청이 너무 큽니다.' }, 413);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ code: 'VALIDATION_ERROR', message: '모델과 API Key를 확인해 주세요.' }, 400);
  try {
    const key = parsed.data.apiKey || await getOpenAIKey();
    if (!key) return json({ code: 'OPENAI_NOT_CONNECTED', message: '저장된 OpenAI API Key가 없습니다.' }, 409);
    await testOpenAI(key, parsed.data.model);
    return json({ ok: true, message: `${parsed.data.model} 실제 연결을 확인했습니다.` });
  } catch {
    return json({ code: 'OPENAI_CONNECTION_FAILED', message: 'OpenAI 연결에 실패했습니다. 키, 계정 권한, 모델 접근 권한을 확인해 주세요.' }, 502);
  }
}
