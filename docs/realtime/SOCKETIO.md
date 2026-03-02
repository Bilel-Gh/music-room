# Real-time with Socket.io — Music Room

## What is Socket.io?

Socket.io is a library that keeps a permanent connection between the mobile app and the backend. Unlike REST API calls (where the mobile asks and the backend responds), Socket.io allows the backend to push data to the mobile at any time, without being asked. This is what makes the app "real-time": when someone votes, all other users see the change instantly.

Under the hood, Socket.io uses WebSockets (a protocol that keeps the connection open). If WebSockets aren't available (rare), it falls back to HTTP long-polling.

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         BACKEND (Express + Socket.io)             │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Socket.io Server                          │  │
│  │                                                             │  │
│  │  ┌─────────────────┐  ┌──────────────────┐                 │  │
│  │  │  Room:           │  │  Room:            │                │  │
│  │  │  event:abc-123   │  │  playlist:def-456 │                │  │
│  │  │                  │  │                   │                │  │
│  │  │  - User A socket │  │  - User B socket  │                │  │
│  │  │  - User B socket │  │  - User C socket  │                │  │
│  │  │  - User C socket │  │                   │                │  │
│  │  └─────────────────┘  └──────────────────┘                 │  │
│  │                                                             │  │
│  │  ┌─────────────────┐  ┌──────────────────┐                 │  │
│  │  │  Room:           │  │  Room:            │                │  │
│  │  │  user:user-A-id  │  │  user:user-B-id  │                │  │
│  │  │                  │  │                   │                │  │
│  │  │  - User A socket │  │  - User B socket  │                │  │
│  │  └─────────────────┘  └──────────────────┘                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Controllers emit events after database operations:               │
│  - event.controller.ts → trackAdded, trackVoted, eventCreated     │
│  - playlist.controller.ts → playlistTrackAdded/Removed/Reordered  │
│  - user.controller.ts → friendRequestReceived                     │
└───────────────────────────────────────────────────────────────────┘
         │                    │                     │
    WebSocket            WebSocket             WebSocket
         │                    │                     │
    ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
    │ User A  │          │ User B  │          │ User C  │
    │ Mobile  │          │ Mobile  │          │ Mobile  │
    └─────────┘          └─────────┘          └─────────┘
```

## How rooms work

Rooms are Socket.io's way of grouping connections. Instead of sending an update to every connected user, we send it only to users in a specific room.

There are three types of rooms:

| Room pattern | Purpose | Example |
|-------------|---------|---------|
| `event:{eventId}` | Users viewing a specific event | `event:abc-123` |
| `playlist:{playlistId}` | Users editing a specific playlist | `playlist:def-456` |
| `user:{userId}` | Personal notifications for a user | `user:user-A-id` |

A user **joins a room** when they open the corresponding screen, and **leaves** when they navigate away.

## Events reference

### Events FROM the mobile TO the backend (ClientToServerEvents)

| Event | Payload | When it's sent | What it does |
|-------|---------|----------------|-------------|
| `authenticate` | `userId: string` | On socket connect | Joins `user:{userId}` room for personal notifications |
| `joinEvent` | `eventId: string` | Opening EventScreen | Joins `event:{eventId}` room |
| `leaveEvent` | `eventId: string` | Leaving EventScreen | Leaves `event:{eventId}` room |
| `joinPlaylist` | `playlistId: string` | Opening PlaylistScreen | Joins `playlist:{playlistId}` room |
| `leavePlaylist` | `playlistId: string` | Leaving PlaylistScreen | Leaves `playlist:{playlistId}` room |

### Events FROM the backend TO the mobile (ServerToClientEvents)

| Event | Payload | When it's emitted | Who receives it |
|-------|---------|-------------------|----------------|
| `trackAdded` | `{ eventId, tracks[] }` | After adding a track to an event | Room `event:{eventId}` |
| `trackVoted` | `{ eventId, tracks[] }` | After a vote is cast/removed | Room `event:{eventId}` |
| `playlistTrackAdded` | `{ playlistId, tracks[] }` | After adding a track to a playlist | Room `playlist:{playlistId}` |
| `playlistTrackRemoved` | `{ playlistId, tracks[] }` | After removing a track from a playlist | Room `playlist:{playlistId}` |
| `playlistTrackReordered` | `{ playlistId, tracks[] }` | After reordering a playlist track | Room `playlist:{playlistId}` |
| `eventCreated` | `{ event }` | After creating a public event | **All connected clients** (global) |
| `eventDeleted` | `{ eventId }` | After deleting an event | **All connected clients** (global) |
| `playlistCreated` | `{ playlist }` | After creating a public playlist | **All connected clients** (global) |
| `playlistDeleted` | `{ playlistId }` | After deleting a playlist | **All connected clients** (global) |
| `friendRequestReceived` | `{ from: { id, name, email } }` | After sending a friend request | Room `user:{targetUserId}` |
| `invitationReceived` | `{ type, name }` | After inviting to event/playlist | Room `user:{targetUserId}` |

## Concrete flow: voting on a track

Here's exactly what happens when User A votes on a track, and User B sees the update:

```
User A (mobile)                Backend                    User B (mobile)
     │                            │                            │
     │ [Already in room            │  [Already in room          │
     │  event:abc-123]            │   event:abc-123]           │
     │                            │                            │
     │ POST /api/events/abc-123/  │                            │
     │   tracks/track-1/vote      │                            │
     │───────────────────────────▶│                            │
     │                            │                            │
     │                            │ 1. voteService.voteForTrack()
     │                            │    (Prisma transaction)    │
     │                            │                            │
     │                            │ 2. Get updated track list  │
     │                            │    sorted by voteCount     │
     │                            │                            │
     │                            │ 3. io.to('event:abc-123')  │
     │                            │    .emit('trackVoted', {   │
     │                            │      eventId, tracks       │
     │                            │    })                      │
     │                            │────────────────────────────▶│
     │                            │                            │
     │ 4. HTTP response:           │                            │ 5. Socket receives
     │ { success, data, voted }   │                            │    'trackVoted'
     │◀───────────────────────────│                            │    → Update UI with
     │                            │                            │      new track list
     │ 6. Update own UI           │                            │
```

**Key files**:
- `backend/src/controllers/event.controller.ts:159-178` — `voteForTrack()` controller emits `trackVoted`
- `mobile/src/screens/EventScreen.tsx` — Listens for `trackVoted` event and updates the track list state

## Backend implementation

### Server setup

**File**: `backend/src/config/socket.ts`

```typescript
import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

// Typed events for type safety
interface ServerToClientEvents {
  trackAdded: (data: { eventId: string; tracks: unknown[] }) => void;
  trackVoted: (data: { eventId: string; tracks: unknown[] }) => void;
  // ... all other events
}

interface ClientToServerEvents {
  joinEvent: (eventId: string) => void;
  leaveEvent: (eventId: string) => void;
  // ... all other events
}

let io: Server<ClientToServerEvents, ServerToClientEvents> | null = null;

export function initSocketServer(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    socket.on('authenticate', (userId) => socket.join(`user:${userId}`));
    socket.on('joinEvent', (eventId) => socket.join(`event:${eventId}`));
    socket.on('leaveEvent', (eventId) => socket.leave(`event:${eventId}`));
    socket.on('joinPlaylist', (playlistId) => socket.join(`playlist:${playlistId}`));
    socket.on('leavePlaylist', (playlistId) => socket.leave(`playlist:${playlistId}`));
  });

  return io;
}

export function getIO() { return io; }
```

### Emitting from controllers

Controllers import `getIO()` and emit after the database operation succeeds:

**File**: `backend/src/controllers/event.controller.ts:105-121`

```typescript
export async function addTrack(req, res, next) {
  try {
    const eventId = req.params.id;
    const track = await eventService.addTrack(eventId, req.body, req.user!.userId);

    const io = getIO();
    if (io) {
      const tracks = await eventService.getEventTracks(eventId);
      io.to(`event:${eventId}`).emit('trackAdded', { eventId, tracks });
    }

    res.status(201).json({ success: true, data: track });
  } catch (err) {
    next(err);
  }
}
```

**File**: `backend/src/controllers/playlist.controller.ts:5-10` — Helper function for playlist updates:

```typescript
async function emitPlaylistUpdate(playlistId, userId, event) {
  const io = getIO();
  if (!io) return;
  const tracks = await playlistService.getPlaylistTracks(playlistId, userId);
  io.to(`playlist:${playlistId}`).emit(event, { playlistId, tracks });
}
```

## Mobile implementation

### Socket client

**File**: `mobile/src/services/socket.ts`

The mobile creates a single Socket.io connection to the backend:

```typescript
const socket = io(API_URL, {
  transports: ['websocket'],  // WebSocket first, no polling
  autoConnect: false,          // Connect manually after login
});

socket.on('connect', () => {
  // Automatically join user room for notifications
  const userId = useAuthStore.getState().userId;
  if (userId) socket.emit('authenticate', userId);
});
```

### Listening in screens

In `EventScreen.tsx`, the component joins the event room on mount and leaves on unmount:

```typescript
useEffect(() => {
  const socket = getSocket();
  socket.emit('joinEvent', eventId);

  socket.on('trackAdded', (data) => {
    if (data.eventId === eventId) setTracks(data.tracks);
  });
  socket.on('trackVoted', (data) => {
    if (data.eventId === eventId) setTracks(data.tracks);
  });

  return () => {
    socket.emit('leaveEvent', eventId);
    socket.off('trackAdded');
    socket.off('trackVoted');
  };
}, [eventId]);
```

### Notification listeners

**File**: `mobile/src/services/socket.ts:15-23`

For global notifications (friend requests, invitations), the socket service uses a callback-based pattern instead of React hooks, because these listeners need to work across all screens:

```typescript
const friendRequestListeners: Set<FriendRequestListener> = new Set();

export function onFriendRequest(listener) {
  friendRequestListeners.add(listener);
  return () => { friendRequestListeners.delete(listener); };
}

socket.on('friendRequestReceived', (data) => {
  friendRequestListeners.forEach(listener => listener(data));
});
```

The `NotificationsScreen` and `AppNavigator` subscribe to these listeners to show badges and notifications.

## Type safety

Both `ServerToClientEvents` and `ClientToServerEvents` are TypeScript interfaces. This means:
- If the backend emits an event with the wrong payload shape, TypeScript catches it at compile time
- If the mobile listens for an event that doesn't exist, TypeScript catches it
- IDE autocompletion shows all available events and their payloads

This eliminates the "silent failure" problem common with Socket.io, where a typo in an event name (`trackAdded` vs `trackadded`) would silently drop messages.
