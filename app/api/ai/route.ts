import { z } from 'zod';
import { runDocumentAI } from '../../server/ai-provider';
import { rateLimitCount, recordUsage } from '../../server/settings';
import { clientHash, isJsonRequest, json, validSameOrigin } from '../../server/security';

const schema = z.object({
  action: z.enum(['polish', 'shorten', 'expand', 'proofread', 'official', 'report', 'summarize', 'continue', 'ask']),
  instruction: z.string().max(2000).optional(),
  content: z.string().min(1).max(100_000),
  scope: z.enum(['selection', 'document']),
});

export async function POST(request: Request) {
  if (!validSameOrigin(request) || !isJsonRequest(request)) return json({ code: 'INVALID_REQUEST', message: '허용되지 않은 요청입니다.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 420_000) return json({ code: 'REQUEST_TOO_LARGE', message: 'AI 요청 내용이 너무 큽니다.' }, 413);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ code: 'VALIDATION_ERROR', message: 'AI 요청 내용을 확인해 주세요.' }, 400);
  const hash = await clientHash(request);
  const since = new Date(Date.now() - 60_000).toISOString();
  if (await rateLimitCount(hash, since) >= 20) return json({ code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' }, 429);
  const usageId = crypto.randomUUID();
  try {
    const result = await runDocumentAI(parsed.data);
    await recordUsage({ id: usageId, model: result.model, action: parsed.data.action, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens, status: 'completed', clientHash: hash });
    return json({ output: result.output, model: result.model, usage: result.usage });
  } catch (reason) {
    const candidate = reason as { code?: string; status?: number; message?: string };
    const code = candidate.code || 'OPENAI_REQUEST_FAILED';
    const status = [400, 409, 429, 502, 503, 504].includes(candidate.status || 0) ? candidate.status! : 502;
    await recordUsage({ id: usageId, model: 'unresolved', action: parsed.data.action, inputTokens: 0, outputTokens: 0, status: 'failed', errorCode: code, clientHash: hash }).catch(() => undefined);
    const message = code === 'OPENAI_NOT_CONNECTED' ? 'OpenAI가 연결되지 않았습니다.' : code === 'OPENAI_EMPTY_RESPONSE' ? 'OpenAI가 빈 결과를 반환했습니다.' : 'AI 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    return json({ code, message }, status);
  }
}
