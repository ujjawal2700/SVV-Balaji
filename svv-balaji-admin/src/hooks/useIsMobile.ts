import { useEffect, useState } from 'react';

/**
 * The one breakpoint in the app.
 *
 * 768px, matching antd's `md`. Below it we are on a phone and the field panel
 * switches to its app shell: bottom tabs, sheets instead of modals, cards
 * instead of tables.
 *
 * Uses matchMedia rather than a resize listener because it fires only when the
 * answer actually changes, not on every pixel of a drag — a resize listener
 * re-rendering the whole tree is exactly the kind of thing that makes a web app
 * feel like a web app.
 */
const MOBILE_QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);

    // Safari below 14 only has the deprecated addListener. Worth keeping: this
    // panel is aimed at field staff on whatever handset they already own.
    if (media.addEventListener) {
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    }
    media.addListener(onChange);
    return () => media.removeListener(onChange);
  }, []);

  return isMobile;
}
