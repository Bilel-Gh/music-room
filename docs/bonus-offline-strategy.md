# Bonus: Offline Mode — Strategy & Architecture

## Overview

Music Room supports a **strict read-only offline mode**. When the device loses network connectivity, the app continues to display previously cached data (events and playlists) but explicitly blocks all mutations (votes, track additions, reordering, deletions). This approach was chosen deliberately to avoid the severe conflict and concurrency issues that come with offline sync mechanisms.

As warned by the subject: *"sync mechanisms carry their lot of problems"*. We opted for a strict read-only offline architecture. Users can consult previously loaded events and playlists, but mutations (votes, edits) are explicitly blocked until the connection is restored.

## Architecture

### Technology Stack

| Component | Role |
|-----------|------|
| `@react-native-community/netinfo` | Detects network state changes in real-time |
| `AsyncStorage` | Persists cached data (events, playlists) for offline viewing |
| `Zustand` (networkStore) | Shares `isConnected` state across the app reactively |

### Components

```
NetInfo.addEventListener()
    │
    ▼
networkStore (Zustand)
    │
    ├─► OfflineBanner (red bar on all screens)
    ├─► HomeScreen (loads from cache if offline, hides create buttons)
    ├─► EventScreen (blocks votes + add track with alert if offline)
    └─► PlaylistScreen (blocks add/move/delete track with alert if offline)

On reconnect:
    └─► HomeScreen re-fetches fresh data on next focus
```

## Offline Behavior

### What works offline

- **Viewing the home feed**: Events and playlists from the last successful fetch are cached in AsyncStorage (keys: `cache:events`, `cache:playlists`). When offline, the app loads this cached data instead of making API calls.
- **Navigation**: Users can browse cached lists. Event and playlist screens display previously loaded data.

### What is blocked offline

All mutations require a connection. When offline, attempting any of these actions shows an alert: *"Mode Hors-Ligne — Cette action necessite une connexion internet."*

- **Voting on tracks**: Blocked — vote state must be consistent with the server.
- **Adding tracks**: Blocked — requires server-side validation and ID generation.
- **Moving / deleting tracks**: Blocked — position changes must be atomic and server-validated.
- **Creating events or playlists**: Create buttons are hidden when offline.
- **Inviting friends**: Requires real-time server interaction.
- **Real-time updates**: Socket.io events are naturally unavailable.

### Visual Indicator

A red banner appears at the top of the screen: **"Mode Hors-Ligne (Lecture seule)"** with a cloud-offline icon. This banner is visible on all main screens (Home, Event, Playlist, Friends, Notifications, Profile) but not on authentication screens.

## Conflict Management

### Strategy: No Conflicts by Design

By blocking all mutations offline, we eliminate the possibility of conflicts entirely. There is no offline queue, no sync mechanism, and no stale writes.

- The **server is always the single source of truth**.
- Cached data is read-only and clearly marked as potentially stale via the offline banner.
- When the connection returns, the app fetches fresh data from the API, replacing any stale cache.

### Stale data handling

When the app comes back online, the cached data in AsyncStorage may be outdated (events deleted, new playlists created, vote counts changed). This is handled by:

1. **Automatic refresh on focus**: `HomeScreen` uses `useFocusEffect` to re-fetch data every time the screen gains focus. When the connection returns and the user navigates to the home screen, fresh data replaces the cache.
2. **Cache update**: Every successful fetch in online mode overwrites the AsyncStorage cache with the latest data.
3. **No stale data mutations**: Since the offline mode is strictly read-only, users cannot take actions based on outdated information.

## Why this approach

The project subject (PDF) explicitly warns that offline mode is complex and allows the offline experience to be "completely different." Our approach keeps things pragmatic and robust:

- **Strict read-only cache** eliminates conflict resolution complexity entirely — no sync queue, no deduplication logic, no race conditions on reconnect.
- **Explicit user feedback** (alert on blocked actions) is transparent and predictable. The user always knows why an action is blocked.
- **Server is Truth** is the simplest and most reliable architecture. No client-side state can diverge from the server.
- **Minimal complexity**: one Zustand store for network state, a few AsyncStorage calls for caching, and inline `isConnected` checks on mutation handlers. No additional dependencies or background processes.
- This approach is defensible: it demonstrates understanding of offline challenges while choosing a robust solution over a fragile one.
