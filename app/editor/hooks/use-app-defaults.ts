'use client';

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_FONT_FAMILY, isBundledFont } from '../../domain/font-families';

export interface AppDocumentDefaults { defaultFont: string; autosaveDelayMs: number }

const fallback: AppDocumentDefaults = { defaultFont: DEFAULT_FONT_FAMILY, autosaveDelayMs: 900 };

async function loadDefaults() {
  try {
    const response = await fetch('/api/app/settings', { cache: 'no-store' });
    if (!response.ok) return fallback;
    const value = await response.json() as Partial<AppDocumentDefaults>;
    if (typeof value.defaultFont === 'string' && isBundledFont(value.defaultFont) && Number.isInteger(value.autosaveDelayMs) && (value.autosaveDelayMs ?? 0) >= 500 && (value.autosaveDelayMs ?? 0) <= 10_000) return { defaultFont: value.defaultFont, autosaveDelayMs: value.autosaveDelayMs! };
  } catch { /* safe defaults remain available offline */ }
  return fallback;
}

export function useAppDefaults() {
  const [defaults, setDefaults] = useState(fallback);
  const refresh = useCallback(async () => {
    setDefaults(await loadDefaults());
  }, []);
  useEffect(() => {
    let active = true;
    void loadDefaults().then((value) => { if (active) setDefaults(value); });
    return () => { active = false; };
  }, []);
  return { defaults, refresh };
}
