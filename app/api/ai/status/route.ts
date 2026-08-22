import { getOpenAIKey, getRuntimeSettings } from '../../../server/settings';
import { json } from '../../../server/security';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [key, settings] = await Promise.all([getOpenAIKey(), getRuntimeSettings()]);
    return json({ connected: Boolean(key), label: settings.model });
  } catch {
    return json({ connected: false, label: 'OPENAI_NOT_CONNECTED' });
  }
}
