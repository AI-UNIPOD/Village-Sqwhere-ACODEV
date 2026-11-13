import { useSyncExternalStore } from "react";

import { loadInvitations, type Hub } from "./hubs-api";

// The invitations waiting for the developer, kept for the visit. The village and Your hubs load
// them; the places bar reads them here to mark Hubs, so it asks for nothing of its own. Null
// until a screen has loaded them.
let kept: Hub[] | null = null;
const listeners = new Set<() => void>();

export function keepInvitations(invitations: Hub[] | null) {
  kept = invitations;
  listeners.forEach((notify) => notify());
}

// Asks the API and keeps the answer, so every screen showing the invitations updates.
export async function refreshInvitations(): Promise<Hub[]> {
  const invitations = await loadInvitations();
  keepInvitations(invitations);
  return invitations;
}

// An invitation the developer just signed or declined is no longer waiting.
export function forgetInvitation(hubId: string) {
  if (kept) keepInvitations(kept.filter((hub) => hub.id !== hubId));
}

export function useKeptInvitations(): Hub[] | null {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => kept,
    () => null,
  );
}
