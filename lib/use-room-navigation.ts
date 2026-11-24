'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function useRoomNavigation() {
  const router = useRouter();
  const fallback = useRef<number>();
  useEffect(() => () => window.clearTimeout(fallback.current), []);

  return useCallback((path: string) => {
    window.clearTimeout(fallback.current);
    fallback.current = window.setTimeout(() => {
      if (location.pathname !== path) location.assign(path);
    }, 6000);
    router.push(path);
  }, [router]);
}
