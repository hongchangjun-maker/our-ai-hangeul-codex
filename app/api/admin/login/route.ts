import { z } from 'zod';
import { audit, failedLoginCount } from '../../../server/settings';
import { clientHash, createAdminSession, isJsonRequest, json, securityConfigured, validSameOrigin, verifyPassword } from '../../../server/security';

const schema = z.object({ password: z.string().min(4).max(128) });

export async function POST(request: Request) {
  if (!securityConfigured()) return json({ code: 'ADMIN_NOT_CONFIGURED', message: '관리자 서버 보안 설정이 필요합니다.' }, 503);
  if (!validSameOrigin(request) || !isJsonRequest(request)) return json({ code: 'INVALID_REQUEST', message: '허용되지 않은 요청입니다.' }, 403);
  if (Number(request.headers.get('content-length') || 0) > 2048) return json({ code: 'REQUEST_TOO_LARGE', message: '요청이 너무 큽니다.' }, 413);
  const hash = await clientHash(request);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  if (await failedLoginCount(hash, since) >= 10) return json({ code: 'RATE_LIMITED', message: '잠시 후 다시 시도해 주세요.' }, 429);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const success = parsed.success && await verifyPassword(parsed.data.password);
  await audit('login', success, hash);
  if (!success) return json({ code: 'INVALID_CREDENTIALS', message: '관리자 비밀번호가 올바르지 않습니다.' }, 401);
  return json({ ok: true }, 200, { 'set-cookie': await createAdminSession(request) });
}
