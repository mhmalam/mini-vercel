// Shared between server and client code — keep free of secrets/env.

/** Statuses with a build/deploy still running — worth polling. */
export const IN_FLIGHT_STATUSES = ["queued", "building", "deploying"] as const;

export function isInFlight(status: string): boolean {
  return (IN_FLIGHT_STATUSES as readonly string[]).includes(status);
}
