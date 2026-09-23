'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { TIME_ZONE_COOKIE, TIME_ZONE_COOKIE_MAX_AGE } from './zone-cookie';

function currentCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${TIME_ZONE_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1] ?? '') : null;
}

/**
 * Writes the browser's zone for the server, and re-renders once if the server had to guess.
 *
 * The first visit is rendered before the cookie exists, so it shows UTC — labelled as UTC,
 * which is honest but not helpful. One `router.refresh()` swaps it for the viewer's clock;
 * every later request already carries the zone and nothing refreshes.
 */
export function TimeZoneCookie() {
  const router = useRouter();

  useEffect(() => {
    let zone: string;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone || currentCookie() === zone) return;

    document.cookie = `${TIME_ZONE_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=${TIME_ZONE_COOKIE_MAX_AGE}; samesite=lax`;
    router.refresh();
  }, [router]);

  return null;
}
