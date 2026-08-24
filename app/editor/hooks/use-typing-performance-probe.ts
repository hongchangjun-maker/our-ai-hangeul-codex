'use client';

import { useEffect, useRef } from 'react';

export function useTypingPerformanceProbe() {
  const renderCount = useRef(0);
  const inputCount = useRef(0);
  const longestTask = useRef(0);
  const latencySamples = useRef<number[]>([]);

  useEffect(() => {
    if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('typing-perf')) return;
    const root = document.documentElement;
    let initialResources = performance.getEntriesByType('resource').length;
    let inputStarted = 0;
    const beforeInput = () => { if (!inputCount.current) initialResources = performance.getEntriesByType('resource').length; inputStarted = performance.now(); };
    const input = () => requestAnimationFrame(() => {
      inputCount.current += 1;
      const latency = performance.now() - inputStarted;
      latencySamples.current = [...latencySamples.current.slice(-99), latency];
      root.dataset.typingKeyToFrameMs = latency.toFixed(2);
      root.dataset.typingLatencySamples = latencySamples.current.map((value) => value.toFixed(2)).join(',');
      root.dataset.typingInputCount = String(inputCount.current);
      root.dataset.typingRenderCount = String(renderCount.current);
      root.dataset.typingNetworkRequests = String(performance.getEntriesByType('resource').length - initialResources);
    });
    const observer = typeof PerformanceObserver === 'undefined' ? null : new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longestTask.current = Math.max(longestTask.current, entry.duration);
      root.dataset.typingLongestTaskMs = longestTask.current.toFixed(2);
    });
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) observer?.observe({ type: 'longtask', buffered: true });
    document.addEventListener('beforeinput', beforeInput, true);
    document.addEventListener('input', input, true);
    root.dataset.typingRenderCount = String(renderCount.current);
    return () => { document.removeEventListener('beforeinput', beforeInput, true); document.removeEventListener('input', input, true); observer?.disconnect(); delete root.dataset.typingKeyToFrameMs; delete root.dataset.typingLatencySamples; delete root.dataset.typingInputCount; delete root.dataset.typingRenderCount; delete root.dataset.typingLongestTaskMs; delete root.dataset.typingNetworkRequests; };
  }, []);

  useEffect(() => {
    renderCount.current += 1;
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('typing-perf')) document.documentElement.dataset.typingRenderCount = String(renderCount.current);
  });
}
