'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_FAVORITE_FONT_FAMILIES, isBundledFont } from '../font-catalog';

const favoriteFontsStorageKey = 'our-ai-hangeul:favorite-fonts';

function loadFavoriteFonts() {
  try {
    const saved = JSON.parse(localStorage.getItem(favoriteFontsStorageKey) ?? 'null');
    return Array.isArray(saved)
      ? saved.filter((font): font is string => typeof font === 'string' && isBundledFont(font)).slice(0, 6)
      : [...DEFAULT_FAVORITE_FONT_FAMILIES];
  } catch {
    return [...DEFAULT_FAVORITE_FONT_FAMILIES];
  }
}

export function useFontPreferences() {
  const [favoriteFonts, setFavoriteFonts] = useState<string[]>(loadFavoriteFonts);

  useEffect(() => {
    try { localStorage.setItem(favoriteFontsStorageKey, JSON.stringify(favoriteFonts)); } catch { /* localStorage unavailable */ }
  }, [favoriteFonts]);

  const toggleFavoriteFont = (family: string) => {
    setFavoriteFonts((current) => current.includes(family)
      ? current.filter((item) => item !== family)
      : [...current, family].slice(-6));
  };

  return { favoriteFonts, toggleFavoriteFont };
}
