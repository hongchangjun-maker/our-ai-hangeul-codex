import { DEFAULT_SETTINGS, getRuntimeSettings } from '../../../server/settings';
import { json } from '../../../server/security';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await getRuntimeSettings();
    return json({ defaultFont: settings.defaultFont, autosaveDelayMs: settings.autosaveDelayMs });
  } catch {
    return json({ defaultFont: DEFAULT_SETTINGS.defaultFont, autosaveDelayMs: DEFAULT_SETTINGS.autosaveDelayMs });
  }
}
