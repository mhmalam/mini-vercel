// Shared between server and client code — keep free of secrets/env.

/** Statuses with a build/deploy still running — worth polling. */
export const IN_FLIGHT_STATUSES = ["queued", "building", "deploying"] as const;

export function isInFlight(status: string): boolean {
  return (IN_FLIGHT_STATUSES as readonly string[]).includes(status);
}

/** "just now", "4m ago", "2h ago", "3d ago" — Vercel-style relative time. */
export function timeAgo(date: string | Date): string {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** owner/name when the repo lives on GitHub, else null. */
export function githubSlug(repoUrl: string): string | null {
  const m = /^(?:https:\/\/|git@)github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/i.exec(
    repoUrl.trim(),
  );
  return m ? m[1]! : null;
}
