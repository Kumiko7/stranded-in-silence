/**
 * A player's name, as it crosses the wire.
 *
 * It lives in `shared/` for the same reason `cosmetics.ts` does: `net/` ships it
 * and both ends need the same rule for what is acceptable. That rule is applied
 * TWICE - once to what this player types, and again to whatever a peer sends -
 * because a name is the one string another browser gets to put on your screen,
 * and nothing else in the protocol is free text.
 *
 * `null` is a player who has not chosen one. The interface falls back to their
 * roster number, so an empty name is never an empty label.
 */

/**
 * Trims, collapses whitespace, strips control characters and caps the length.
 * Returns null for anything with nothing left in it.
 */
export function cleanPlayerName(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string') return null;

  const name = raw
    // Control characters and the bidi overrides: both are invisible, and both
    // can make one name pretend to be another on a roster.
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, Math.max(1, maxLength));

  return name.length ? name : null;
}
