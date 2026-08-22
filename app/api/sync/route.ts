import { createCloudDocument, readCloudDocument, readCloudVersion, updateCloudDocument } from '../../server/cloud-documents';
import { clientHash, isJsonRequest, json, validSameOrigin } from '../../server/security';

function token(request: Request) { return new URL(request.url).searchParams.get('code')?.trim() ?? ''; }

export async function GET(request: Request) {
  try {
    const revision = Number(new URL(request.url).searchParams.get('revision'));
    if (Number.isInteger(revision) && revision > 0) {
      const document = await readCloudVersion(token(request), revision);
      return document ? json({ document, revision }) : json({ code: 'NOT_FOUND', message: '버전을 찾지 못했습니다.' }, 404);
    }
    const result = await readCloudDocument(token(request));
    return result ? json(result) : json({ code: 'NOT_FOUND', message: '공유 문서를 찾지 못했습니다.' }, 404);
  } catch (error) { return json({ code: 'INVALID_REQUEST', message: error instanceof Error ? error.message : '요청을 처리하지 못했습니다.' }, 400); }
}

export async function POST(request: Request) {
  if (!validSameOrigin(request) || !isJsonRequest(request)) return json({ code: 'INVALID_REQUEST', message: '허용되지 않은 요청입니다.' }, 403);
  try { const body = await request.json() as { document?: unknown }; return json(await createCloudDocument(body.document, await clientHash(request)), 201); }
  catch (error) { return json({ code: 'INVALID_DOCUMENT', message: error instanceof Error ? error.message : '문서를 저장하지 못했습니다.' }, 400); }
}

export async function PUT(request: Request) {
  if (!validSameOrigin(request) || !isJsonRequest(request)) return json({ code: 'INVALID_REQUEST', message: '허용되지 않은 요청입니다.' }, 403);
  try {
    const body = await request.json() as { code?: string; baseRevision?: number; document?: unknown };
    if (!body.code || !Number.isInteger(body.baseRevision)) return json({ code: 'INVALID_REQUEST', message: '공유 코드와 기준 버전이 필요합니다.' }, 400);
    const result = await updateCloudDocument(body.code, body.baseRevision!, body.document, await clientHash(request));
    if (result.kind === 'missing') return json({ code: 'NOT_FOUND', message: '공유 문서를 찾지 못했습니다.' }, 404);
    if (result.kind === 'conflict') return json({ code: 'REVISION_CONFLICT', message: '다른 사용자가 먼저 저장했습니다.', latest: result.latest }, 409);
    return json(result);
  } catch (error) { return json({ code: 'INVALID_DOCUMENT', message: error instanceof Error ? error.message : '문서를 저장하지 못했습니다.' }, 400); }
}
