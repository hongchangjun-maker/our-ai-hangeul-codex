import { useEffect } from 'react';

export function useShareLinkLaunch(setScreen: (value: 'editor') => void, setCloudOpen: (value: true) => void) {
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('share')) return;
    const timer = setTimeout(() => { setScreen('editor'); setCloudOpen(true); }, 0);
    return () => clearTimeout(timer);
  }, [setCloudOpen, setScreen]);
}
