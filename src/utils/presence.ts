import { UserPresenceStatus, UserProfile } from '../types';

/**
 * Checks whether a user is currently online based on explicit status and heartbeat timestamp.
 * If a client disconnected or tab closed without beforeunload, heartbeat expires after 90 seconds.
 */
export function isUserOnline(
  user?: { status?: UserPresenceStatus; lastSeen?: any; uid?: string } | null,
  currentUserId?: string
): boolean {
  if (!user) return false;

  // If user explicitly set status to offline, they are offline
  if (user.status === 'offline') return false;

  // If it's the current user, they are actively looking at the client
  if (currentUserId && user.uid === currentUserId) {
    return true;
  }

  // Check lastSeen timestamp
  if (user.lastSeen) {
    let lastSeenMs = 0;

    if (typeof user.lastSeen.toMillis === 'function') {
      lastSeenMs = user.lastSeen.toMillis();
    } else if (typeof user.lastSeen.seconds === 'number') {
      lastSeenMs = user.lastSeen.seconds * 1000;
    } else if (user.lastSeen instanceof Date) {
      lastSeenMs = user.lastSeen.getTime();
    } else if (typeof user.lastSeen === 'number') {
      lastSeenMs = user.lastSeen;
    }

    if (lastSeenMs > 0) {
      const diffMs = Date.now() - lastSeenMs;
      // If lastSeen is older than 90 seconds (heartbeat is sent every 30s), mark offline
      if (diffMs > 90000) {
        return false;
      }
    }
  } else {
    // No lastSeen and not current user -> treat as offline
    return false;
  }

  return user.status === 'online' || user.status === 'idle' || user.status === 'busy';
}

/**
 * Returns the effective UserPresenceStatus taking into account inactivity and explicit offline setting.
 */
export function getEffectivePresence(
  user?: { status?: UserPresenceStatus; lastSeen?: any; uid?: string } | null,
  currentUserId?: string
): UserPresenceStatus {
  if (!user) return 'offline';
  if (user.status === 'offline') return 'offline';

  const online = isUserOnline(user, currentUserId);
  if (!online) return 'offline';

  return user.status || 'online';
}

/**
 * Formats presence status display text with optional last seen time
 */
export function formatPresenceText(
  status: UserPresenceStatus,
  lastSeen?: any
): string {
  if (status === 'online') return 'Online';
  if (status === 'idle') return 'Away';
  if (status === 'busy') return 'Do not disturb';

  if (lastSeen) {
    let lastSeenMs = 0;
    if (typeof lastSeen.toMillis === 'function') {
      lastSeenMs = lastSeen.toMillis();
    } else if (typeof lastSeen.seconds === 'number') {
      lastSeenMs = lastSeen.seconds * 1000;
    } else if (lastSeen instanceof Date) {
      lastSeenMs = lastSeen.getTime();
    } else if (typeof lastSeen === 'number') {
      lastSeenMs = lastSeen;
    }

    if (lastSeenMs > 0) {
      const diffSec = Math.floor((Date.now() - lastSeenMs) / 1000);
      if (diffSec < 60) return 'Offline (just now)';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `Offline (${diffMin}m ago)`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `Offline (${diffHours}h ago)`;
      const diffDays = Math.floor(diffHours / 24);
      return `Offline (${diffDays}d ago)`;
    }
  }

  return 'Offline';
}
