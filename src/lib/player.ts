const KEY = 'outlier:player';

/** The anonymous player id: a UUID kept in localStorage. No login, no personal data. */
export function getPlayerId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Storage blocked: play as a one-off player for this visit.
    return crypto.randomUUID();
  }
}
