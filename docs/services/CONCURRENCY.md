# Concurrency Management — Music Room

This is the most critical technical aspect of the project. When multiple users interact with the same event or playlist simultaneously, data can become inconsistent if not handled properly.

## What is concurrency in this project?

Concurrency means multiple users performing actions at the same time on the same data. In Music Room, this happens in two main scenarios:

1. **Simultaneous votes**: Two users vote on the same track at the exact same time
2. **Simultaneous playlist edits**: Two users add/remove/reorder tracks in the same playlist at the exact same time

Without proper handling, these scenarios can corrupt data.

## Problem 1: Race condition on votes

### The problem

The vote system uses a **toggle**: voting again removes your vote. The `Track` table has a `voteCount` field that caches the total number of votes.

Here's what could go wrong WITHOUT a transaction:

```
Time    User A                      User B                      Database
─────   ─────────────────────       ─────────────────────       ──────────────
                                                                voteCount = 5
T1      Read voteCount → 5
T2                                  Read voteCount → 5
T3      Add vote
T4      Write voteCount = 6                                     voteCount = 6
T5                                  Add vote
T6                                  Write voteCount = 6         voteCount = 6
                                                                ← WRONG! Should be 7
```

Both users read `voteCount = 5`, both compute `5 + 1 = 6`, and both write `6`. We lost User B's vote.

### The solution: Prisma transactions with atomic operations

**File**: `backend/src/services/vote.service.ts:67-91`

```typescript
const result = await prisma.$transaction(async (tx) => {
  // Step 1: Check if vote exists (inside transaction = isolated read)
  const existingVote = await tx.vote.findUnique({
    where: { trackId_userId: { trackId, userId } },
  });

  if (existingVote) {
    // Unvote: delete vote + DECREMENT (atomic)
    await tx.vote.delete({ where: { id: existingVote.id } });
    const updatedTrack = await tx.track.update({
      where: { id: trackId },
      data: { voteCount: { decrement: 1 } },  // ← atomic decrement
    });
    return { track: updatedTrack, voted: false };
  }

  // Vote: create vote + INCREMENT (atomic)
  await tx.vote.create({ data: { trackId, userId } });
  const updatedTrack = await tx.track.update({
    where: { id: trackId },
    data: { voteCount: { increment: 1 } },  // ← atomic increment
  });
  return { track: updatedTrack, voted: true };
});
```

**How this solves the problem**:

1. **`prisma.$transaction()`**: All operations inside the callback happen atomically — if any step fails, everything is rolled back. No partial updates.

2. **`{ increment: 1 }` / `{ decrement: 1 }`**: Instead of reading the current value, computing `value + 1`, and writing it back (read-modify-write), Prisma sends `UPDATE track SET voteCount = voteCount + 1` directly to PostgreSQL. This is **atomic at the database level**: PostgreSQL guarantees that two concurrent increments will both be applied correctly.

With this approach, the same scenario becomes:

```
Time    User A                      User B                      Database
─────   ─────────────────────       ─────────────────────       ──────────────
                                                                voteCount = 5
T1      BEGIN TRANSACTION
T2      Check vote → doesn't exist
T3                                  BEGIN TRANSACTION
T4      Create vote
T5      INCREMENT voteCount                                     voteCount = 6
T6      COMMIT
T7                                  Check vote → doesn't exist
T8                                  Create vote
T9                                  INCREMENT voteCount         voteCount = 7 ✓
T10                                 COMMIT
```

### Additional safety: unique constraint

**File**: `backend/prisma/schema.prisma:122`

```prisma
@@unique([trackId, userId])
```

Even if by some miracle two identical vote creations slip through, the database itself rejects the duplicate with a unique constraint violation. This is a safety net — it should never trigger under normal operation, but it guarantees data integrity.

## Problem 2: Race condition on playlist positions

### The problem

Playlist tracks have a `position` field (0, 1, 2, 3...) that determines their order. When someone reorders a track, other positions need to shift. Two users reordering at the same time can create gaps or duplicates in positions.

Example WITHOUT a transaction — User A moves track from position 0 to position 2, User B moves track from position 1 to position 0:

```
Before:  [Track A: pos 0] [Track B: pos 1] [Track C: pos 2]

User A (move A: 0→2):        User B (move B: 1→0):
  Read positions: 0,1,2        Read positions: 0,1,2
  Shift B,C down               Shift A up
  Set A to 2                   Set B to 0

After (CORRUPTED):  Both may write conflicting positions
                    [Track B: pos 0] [Track A: pos 0] [Track C: pos 2]  ← DUPLICATE POSITION 0!
```

### The solution: Prisma transactions with sequential shifts

**File**: `backend/src/services/playlist.service.ts:176-218`

```typescript
export async function reorderTrack(playlistId, trackId, newPosition, userId) {
  await assertCanEdit(playlistId, userId);

  return prisma.$transaction(async (tx) => {
    // Step 1: Get current track position
    const track = await tx.playlistTrack.findUnique({ where: { id: trackId } });
    const oldPosition = track.position;
    if (oldPosition === newPosition) return;  // No-op

    // Step 2: Clamp to valid range
    const trackCount = await tx.playlistTrack.count({ where: { playlistId } });
    const clampedNew = Math.min(newPosition, trackCount - 1);

    // Step 3: Shift affected tracks
    if (oldPosition < clampedNew) {
      // Moving DOWN: shift tracks between old+1 and new UP by -1
      await tx.playlistTrack.updateMany({
        where: {
          playlistId,
          position: { gt: oldPosition, lte: clampedNew },
        },
        data: { position: { decrement: 1 } },
      });
    } else {
      // Moving UP: shift tracks between new and old-1 DOWN by +1
      await tx.playlistTrack.updateMany({
        where: {
          playlistId,
          position: { gte: clampedNew, lt: oldPosition },
        },
        data: { position: { increment: 1 } },
      });
    }

    // Step 4: Place the track at its new position
    await tx.playlistTrack.update({
      where: { id: trackId },
      data: { position: clampedNew },
    });
  });
}
```

**How this solves the problem**:

The entire operation (read positions, shift intermediate tracks, move the target) happens inside a single `$transaction()`. PostgreSQL guarantees that:
- No other transaction can modify the same rows while this one is running
- If any step fails, all changes are rolled back
- The positions are always contiguous (0, 1, 2, 3...) with no gaps or duplicates

### Same approach for add and remove

**Adding a track** (`backend/src/services/playlist.service.ts:135-154`):
```typescript
return prisma.$transaction(async (tx) => {
  // Find the current max position
  const lastTrack = await tx.playlistTrack.findFirst({
    where: { playlistId },
    orderBy: { position: 'desc' },
  });
  const nextPosition = lastTrack ? lastTrack.position + 1 : 0;

  return tx.playlistTrack.create({
    data: { ...data, playlistId, addedById: userId, position: nextPosition },
  });
});
```

Without a transaction, two simultaneous adds could both read the same `lastTrack.position`, compute the same `nextPosition`, and create two tracks with the same position.

**Removing a track** (`backend/src/services/playlist.service.ts:157-173`):
```typescript
return prisma.$transaction(async (tx) => {
  const track = await tx.playlistTrack.findUnique({ where: { id: trackId } });

  await tx.playlistTrack.delete({ where: { id: trackId } });

  // Shift all tracks after the deleted one
  await tx.playlistTrack.updateMany({
    where: { playlistId, position: { gt: track.position } },
    data: { position: { decrement: 1 } },
  });
});
```

After deletion, all tracks with a higher position are shifted down by 1 to fill the gap. This maintains contiguous positions.

## Problem 3: LOCATION_TIME access control

### The problem

For `LOCATION_TIME` events, users must be within 5km of the event AND within the time window to vote or add tracks. Without proper checks, a user could:
- Vote before the event starts
- Vote after the event ends
- Vote from a different city

### The solution: Haversine formula + time window check

**File**: `backend/src/services/vote.service.ts:4-13` and `backend/src/services/vote.service.ts:44-63`

```typescript
// Haversine formula: distance between two GPS points
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const MAX_DISTANCE_KM = 5;
```

Before allowing a vote on a LOCATION_TIME event, the service checks:

1. **Time check**: Is the current time between `event.startTime` and `event.endTime`?
2. **Location check**: Is the user's GPS location within 5km of the event's coordinates?
3. **Location required**: If the event has coordinates, the user MUST provide their own coordinates

The same checks are applied for adding tracks to LOCATION_TIME events (`backend/src/services/event.service.ts:223-240`).

## Summary of all concurrency protections

| Operation | Problem | Solution | File:Lines |
|-----------|---------|----------|------------|
| Vote on track | Lost votes (read-modify-write race) | `$transaction` + atomic `increment/decrement` | `vote.service.ts:67-91` |
| Double vote | Same user votes twice simultaneously | `@@unique([trackId, userId])` constraint | `schema.prisma:122` |
| Add playlist track | Two tracks get same position | `$transaction` reads max position + creates | `playlist.service.ts:139-154` |
| Remove playlist track | Gap in positions after delete | `$transaction` deletes + shifts remaining | `playlist.service.ts:160-173` |
| Reorder playlist track | Overlapping position shifts | `$transaction` with sequential shift logic | `playlist.service.ts:184-218` |
| Double event join | Same user joins twice | `@@unique([eventId, userId])` constraint | `schema.prisma:136` |
| Double playlist member | Same user invited twice | `@@unique([playlistId, userId])` constraint | `schema.prisma:187` |
| LOCATION_TIME bypass | Vote from wrong place/time | Haversine distance check + time window | `vote.service.ts:44-63` |

## Why Prisma transactions are sufficient

Prisma's `$transaction()` with the interactive callback pattern maps to PostgreSQL's `BEGIN...COMMIT` with `READ COMMITTED` isolation level. This means:

- Each statement inside the transaction sees the latest committed data
- If two transactions try to modify the same row, one waits for the other to finish
- The `increment`/`decrement` operations compile to `SET column = column + 1` which is atomic at the SQL level

For our use case (a music app, not a banking system), this provides enough protection without the overhead of `SERIALIZABLE` isolation or explicit row locking (`SELECT FOR UPDATE`).
