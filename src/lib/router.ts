import { useCallback, useEffect, useState, type MouseEvent } from 'react';

/** A very small history-API router: the app only has four pages. */
export function useRoute(): [string, (to: string) => void] {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) window.history.pushState(null, '', to);
    setPath(to);
    window.scrollTo(0, 0);
  }, []);
  return [path, navigate];
}

/** onClick for in-app links: client-side navigation unless the user wants a new tab. */
export function linkHandler(navigate: (to: string) => void, to: string) {
  return (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
}
