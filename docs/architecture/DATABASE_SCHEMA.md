# Database Schema — Music Room

The database is a PostgreSQL instance hosted on Supabase. The schema is defined in `backend/prisma/schema.prisma` and managed through Prisma migrations.

## Schema overview

```
┌──────────────────┐         ┌──────────────────┐
│      User        │         │   Friendship     │
│──────────────────│    1:N  │──────────────────│
│ id (PK, UUID)    │◄────────│ userId (FK)      │
│ email (unique)   │         │ friendId (FK)    │
│ password?        │◄────────│ status           │
│ name             │    1:N  │ (PENDING/ACCEPTED)│
│ googleId? (uniq) │         └──────────────────┘
│ emailVerified    │
│ isAdmin          │
│ isPremium        │
│ publicInfo?      │
│ friendsInfo?     │
│ privateInfo?     │
│ musicPreferences │
│ verificationCode?│
│ resetToken?      │
└────────┬─────────┘
         │
         │ User creates/participates in...
         │
    ┌────┴──────────────────────────────────────────────┐
    │                                                    │
    ▼                                                    ▼
┌──────────────────┐                          ┌──────────────────┐
│     Event        │                          │    Playlist      │
│──────────────────│                          │──────────────────│
│ id (PK, UUID)    │                          │ id (PK, UUID)    │
│ name             │                          │ name             │
│ description?     │                          │ description?     │
│ creatorId (FK)   │                          │ creatorId (FK)   │
│ isPublic         │                          │ isPublic         │
│ licenseType      │                          │ licenseType      │
│ startTime?       │                          │ (OPEN/INVITE_ONLY)│
│ endTime?         │                          └────────┬─────────┘
│ latitude?        │                                   │
│ longitude?       │                              ┌────┴────┐
└────────┬─────────┘                              │         │
         │                                        ▼         ▼
    ┌────┴────┐                          ┌──────────┐ ┌──────────────┐
    │         │                          │ Playlist │ │ Playlist     │
    ▼         ▼                          │ Track    │ │ Member       │
┌────────┐ ┌──────────────┐              │──────────│ │──────────────│
│ Track  │ │ EventMember  │              │ id       │ │ id           │
│────────│ │──────────────│              │ playlistId│ │ playlistId  │
│ id     │ │ id           │              │ title    │ │ userId       │
│ eventId│ │ eventId      │              │ artist   │ │ canEdit      │
│ title  │ │ userId       │              │ position │ │ status       │
│ artist │ │ role         │              │ addedById│ │ (INVITED/    │
│ voteCount│ (CREATOR/    │              └──────────┘ │  ACCEPTED)   │
│ addedById│  INVITED/    │                           └──────────────┘
└────┬───┘ │  PARTICIPANT)│
     │     └──────────────┘
     ▼
┌────────┐
│ Vote   │
│────────│
│ id     │
│ trackId│
│ userId │
│ (unique│
│  pair) │
└────────┘
```

## Tables explained

### User

The central table. Stores authentication info and profile data.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `email` | String (unique) | Login email |
| `password` | String? | Bcrypt hash. Null if user signed up via Google only |
| `name` | String | Display name |
| `googleId` | String? (unique) | Google OAuth identifier, null if not linked |
| `emailVerified` | Boolean | Whether the email has been confirmed |
| `isAdmin` | Boolean | Admin flag |
| `isPremium` | Boolean | Premium subscription flag (gates playlist creation) |
| `publicInfo` | String? | Profile info visible to everyone |
| `friendsInfo` | String? | Profile info visible only to friends |
| `privateInfo` | String? | Profile info visible only to the user |
| `musicPreferences` | String[] | Array of music genre preferences |
| `verificationCode` | String? | 6-digit email verification code |
| `verificationCodeExpiry` | DateTime? | Code expiration (15 min after generation) |
| `resetToken` | String? | Password reset token |
| `resetTokenExpiry` | DateTime? | Reset token expiration (30 min) |

The profile visibility system uses three levels: `publicInfo` (anyone can see), `friendsInfo` (only accepted friends), `privateInfo` (only the user themselves). The backend checks the relationship between viewer and profile owner before deciding which fields to include in the response.

### Friendship

Tracks friend relationships between two users.

| Column | Type | Description |
|--------|------|-------------|
| `userId` | UUID (FK → User) | The user who sent the request |
| `friendId` | UUID (FK → User) | The user who received the request |
| `status` | String | `PENDING` (request sent) or `ACCEPTED` (friends) |

**Unique constraint**: `@@unique([userId, friendId])` — can't send the same request twice.

A friendship always starts as `PENDING` when user A sends a request to user B. When B accepts, the status changes to `ACCEPTED`. To check if two users are friends, the backend looks for an `ACCEPTED` friendship in either direction.

### Event

A music voting session where participants add tracks and vote.

| Column | Type | Description |
|--------|------|-------------|
| `name` | String | Event name |
| `creatorId` | UUID (FK → User) | Who created it |
| `isPublic` | Boolean | Whether it shows in the public feed |
| `licenseType` | Enum | `OPEN`, `INVITE_ONLY`, or `LOCATION_TIME` |
| `startTime` / `endTime` | DateTime? | Time window for LOCATION_TIME events |
| `latitude` / `longitude` | Float? | GPS coordinates for LOCATION_TIME events |

**License types**:
- `OPEN`: anyone can join, add tracks, and vote
- `INVITE_ONLY`: only explicitly invited members can participate
- `LOCATION_TIME`: must be within 5km of the event location AND within the time window

### Track

A music track added to an event for voting.

| Column | Type | Description |
|--------|------|-------------|
| `eventId` | UUID (FK → Event) | Which event this track belongs to |
| `title` | String | Track title |
| `artist` | String | Artist name |
| `externalUrl` | String? | Optional link (Spotify, YouTube...) |
| `addedById` | UUID (FK → User) | Who added it |
| `voteCount` | Int | Cached vote count (denormalized for performance) |

`voteCount` is a denormalized field — it duplicates data that could be computed from the `Vote` table. This avoids running `COUNT(*)` on every track list request. It's updated atomically inside a Prisma transaction when a vote is added or removed.

**Cascade delete**: when an event is deleted, all its tracks are automatically removed.

### Vote

Records that a user voted for a specific track. Implements a toggle: voting again removes the vote.

| Column | Type | Description |
|--------|------|-------------|
| `trackId` | UUID (FK → Track) | The track being voted on |
| `userId` | UUID (FK → User) | Who voted |

**Unique constraint**: `@@unique([trackId, userId])` — one vote per user per track, enforced at the database level.

### EventMember

Links users to events with a role.

| Column | Type | Description |
|--------|------|-------------|
| `eventId` | UUID (FK → Event) | The event |
| `userId` | UUID (FK → User) | The member |
| `role` | Enum | `CREATOR`, `INVITED`, or `PARTICIPANT` |

**Unique constraint**: `@@unique([eventId, userId])` — a user can only be a member once.

The creator is automatically added as `CREATOR` when the event is created. Invited users start as `INVITED` and become `PARTICIPANT` when they accept.

### Playlist

A collaborative playlist where members can add, remove, and reorder tracks.

| Column | Type | Description |
|--------|------|-------------|
| `name` | String | Playlist name |
| `creatorId` | UUID (FK → User) | Who created it |
| `isPublic` | Boolean | Whether it shows in the public feed |
| `licenseType` | Enum | `OPEN` or `INVITE_ONLY` |

### PlaylistTrack

A track in a playlist, with a position for ordering.

| Column | Type | Description |
|--------|------|-------------|
| `playlistId` | UUID (FK → Playlist) | Which playlist |
| `title` | String | Track title |
| `artist` | String | Artist name |
| `position` | Int | Order in the playlist (0-indexed) |
| `addedById` | UUID (FK → User) | Who added it |

The `position` field is managed via Prisma transactions: when a track is moved or removed, all affected positions are recalculated atomically.

### PlaylistMember

Links users to playlists with edit permissions.

| Column | Type | Description |
|--------|------|-------------|
| `playlistId` | UUID (FK → Playlist) | The playlist |
| `userId` | UUID (FK → User) | The member |
| `canEdit` | Boolean | Whether the member can add/remove/reorder tracks |
| `status` | String | `INVITED` or `ACCEPTED` |

**Unique constraint**: `@@unique([playlistId, userId])` — one membership per user per playlist.

## Key design decisions

1. **UUIDs as primary keys**: All IDs are UUIDs (`@default(uuid())`). Unlike auto-incrementing integers, UUIDs can be generated client-side and don't expose how many records exist.

2. **Denormalized voteCount**: The `Track.voteCount` field avoids expensive `COUNT(*)` queries. It's kept consistent through Prisma transactions that update it when votes are added/removed.

3. **Cascade deletes**: `onDelete: Cascade` on Track, Vote, EventMember, PlaylistTrack, and PlaylistMember ensures that deleting an event or playlist cleans up all related records automatically.

4. **Composite unique constraints**: `@@unique([trackId, userId])` on Vote and `@@unique([eventId, userId])` on EventMember prevent duplicates at the database level, as a safety net on top of application-level checks.

5. **No separate role table**: Roles are simple enums (`MemberRole`, `PlaylistLicense`) rather than a separate table. There are only 2-3 values each, so a join table would be over-engineering.
