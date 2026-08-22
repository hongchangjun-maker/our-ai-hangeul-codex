import { getEnv } from '../../../server/env';
import { json } from '../../../server/security';

export async function GET() {
  const url = getEnv().COLLAB_WORKER_URL?.replace(/\/$/, '');
  return url ? json({ connected: true, url }) : json({ connected: false, message: '실시간 공동 편집 저장소가 아직 연결되지 않았습니다.' });
}
