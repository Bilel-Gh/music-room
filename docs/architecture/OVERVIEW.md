# Architecture Overview — Music Room

## What is Music Room?

Music Room is a collaborative music application where users can create events to vote on tracks together, or build shared playlists with friends. Everything happens in real time: when someone votes or adds a track, all other participants see the change instantly.

The app is composed of three main parts that communicate with each other:

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOBILE APP                               │
│              React Native (Expo) + TypeScript                   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Screens  │  │  Zustand  │  │   API    │  │  Socket.io   │   │
│  │  (UI)     │  │  (State)  │  │  Client  │  │  Client      │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │             │                │            │
└───────┼──────────────┼─────────────┼────────────────┼────────────┘
        │              │             │                │
        │              │     HTTPS (REST)      WebSocket (WS)
        │              │             │                │
┌───────┼──────────────┼─────────────┼────────────────┼────────────┐
│       │              │             │                │            │
│  ┌────▼─────────────────────────────────────────────▼───────┐   │
│  │                    EXPRESS SERVER                          │   │
│  │                                                           │   │
│  │  ┌─────────┐  ┌────────────┐  ┌───────────┐             │   │
│  │  │ Routes  │─▶│ Controllers│─▶│ Services  │             │   │
│  │  └─────────┘  └────────────┘  └─────┬─────┘             │   │
│  │                                      │                    │   │
│  │  ┌──────────────────┐  ┌─────────────▼──────────────┐    │   │
│  │  │   Middleware      │  │        Socket.io           │    │   │
│  │  │ (auth, validate, │  │  (rooms, broadcasts,       │    │   │
│  │  │  rate-limit, log) │  │   real-time events)        │    │   │
│  │  └──────────────────┘  └────────────────────────────┘    │   │
│  └──────────────────────────────┬────────────────────────────┘   │
│                                 │                                │
│              BACKEND            │  Node.js + TypeScript          │
└─────────────────────────────────┼────────────────────────────────┘
                                  │
                            Prisma ORM
                                  │
                    ┌─────────────▼─────────────┐
                    │                           │
                    │    PostgreSQL Database     │
                    │    (hosted on Supabase)    │
                    │                           │
                    └───────────────────────────┘
```

## How the parts work together

### 1. Mobile App → Backend (REST API)

The mobile app uses **Axios** to make HTTP requests to the backend. Every request includes:
- A JWT token in the `Authorization` header (for authentication)
- Device metadata (`X-Platform`, `X-Device`, `X-App-Version`) for logging

The API follows REST conventions: `GET` to read, `POST` to create, `PUT` to update, `DELETE` to remove. All responses follow the same shape: `{ success: true, data: ... }` or `{ success: false, error: "..." }`.

**Key file**: `mobile/src/services/api.ts` — Axios instance with interceptors for JWT and device metadata.

### 2. Mobile App ↔ Backend (WebSocket)

For real-time features, the mobile app opens a persistent WebSocket connection using **Socket.io**. This connection stays open as long as the app is active. When something happens (a vote, a track added, a friend request), the backend pushes updates through this channel without the app needing to ask.

Socket.io uses **rooms** to send updates only to people who need them:
- `event:{eventId}` — people looking at a specific event
- `playlist:{playlistId}` — people editing a specific playlist
- `user:{userId}` — personal notifications (friend requests, invitations)

**Key files**: `backend/src/config/socket.ts` (server setup), `mobile/src/services/socket.ts` (client).

### 3. Backend → Database (Prisma)

The backend never talks to PostgreSQL directly. It goes through **Prisma**, an ORM that provides type-safe queries in TypeScript. Prisma generates types from the database schema, so if a table has a `name` column of type `String`, TypeScript knows about it at compile time.

The database is hosted on **Supabase**, but we only use Supabase as a PostgreSQL host. No Supabase SDK, no Supabase Auth — just a raw database connection string.

**Key files**: `backend/prisma/schema.prisma` (schema definition), `backend/src/lib/prisma.ts` (client singleton).

## Request lifecycle

Here's what happens when a user votes on a track in an event:

```
1. User taps "Vote" on mobile
        │
2. Axios sends POST /api/events/:id/tracks/:trackId/vote
   with JWT token + location data
        │
3. Express receives the request
   → helmet adds security headers
   → cors checks origin
   → globalLimiter checks rate limit
   → auth middleware verifies JWT
   → validate middleware checks Zod schema
   → requestLogger logs the action
        │
4. event.controller.ts handles the request
   → calls voteService.voteForTrack()
        │
5. vote.service.ts runs a Prisma TRANSACTION:
   → check if user already voted (toggle)
   → create/delete vote + update voteCount
   → all in one atomic operation
        │
6. Controller gets updated track data
   → responds with JSON to the mobile
   → ALSO: fetches updated track list
   → emits 'trackVoted' via Socket.io
     to room event:{eventId}
        │
7. All other users in the event screen
   receive the updated track list
   via their WebSocket connection
   → their UI updates automatically
```

## Project structure (simplified)

```
music-room/
├── backend/
│   └── src/
│       ├── config/         ← Socket.io, Passport, rate-limit, logger, Swagger
│       ├── middleware/      ← auth, error, validate, logger, premium
│       ├── routes/          ← auth, user, event, playlist (+ Swagger docs)
│       ├── controllers/     ← request handlers (call services, emit socket events)
│       ├── services/        ← business logic (Prisma queries, validations)
│       ├── schemas/         ← Zod validation schemas
│       └── tests/           ← vitest + supertest
├── mobile/
│   └── src/
│       ├── screens/         ← all app screens (Login, Home, Event, Playlist...)
│       ├── navigation/      ← React Navigation setup (tabs + stacks)
│       ├── services/        ← API client (Axios) + Socket.io client
│       ├── store/           ← Zustand stores (auth, network state)
│       └── components/      ← shared components (OfflineBanner)
├── prisma/
│   └── schema.prisma        ← database schema (single source of truth)
└── Makefile                  ← dev, build, test, migrate commands
```

## The two main services

### Service 1: Music Track Vote (Events)

Users create "events" where participants can add tracks and vote for their favorites. Tracks are sorted by vote count in real time. Events have three license types:
- **OPEN**: anyone can join and vote
- **INVITE_ONLY**: only invited members can participate
- **LOCATION_TIME**: must be within 5km of the event location AND during the event time window

### Service 2: Music Playlist Editor (Playlists)

Users create collaborative playlists where members can add, remove, and reorder tracks. Each member can have edit permissions or read-only access. Like events, playlists can be OPEN (anyone edits) or INVITE_ONLY (only members with `canEdit = true`).

Both services use **Prisma transactions** for operations that could conflict (concurrent votes, concurrent reordering) and **Socket.io** to push updates in real time.
