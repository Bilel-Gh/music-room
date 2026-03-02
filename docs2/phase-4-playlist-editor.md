# Phase 4 — Editeur de playlist collaboratif

## Ce qu'on a construit

Un systeme de playlists collaboratives ou plusieurs utilisateurs peuvent :
1. Creer des playlists (publiques ou privees)
2. Ajouter et supprimer des morceaux
3. Reordonner les morceaux par drag-and-drop (cote serveur)
4. Inviter des utilisateurs avec des permissions (editeur ou lecteur seul)
5. Voir les modifications en temps reel via Socket.io

---

## Comment ca marche (vue d'ensemble)

```
        Playlist "Chill Vibes"
        ┌──────────────────────────────────┐
        │  0. Clair de Lune — Debussy      │
        │  1. Gymnopédie — Satie           │
        │  2. Blue in Green — Miles Davis  │
        └──────────────────────────────────┘
              │           │          │
          Ajouter    Supprimer   Réordonner
              │           │          │
         position      reindex    transaction
         = max + 1    positions   atomique
```

Chaque track a un champ `position` (entier) qui determine son ordre dans la playlist. Quand on ajoute, supprime ou deplace une track, les positions de toutes les autres tracks concernees sont recalculees dans une **transaction Prisma**.

### Les 2 types de licence

| Type | Qui peut voir | Qui peut editer |
|------|--------------|-----------------|
| `OPEN` | Tout le monde (si publique) | Tout le monde |
| `INVITE_ONLY` | Tout le monde (si publique), sinon membres | Seulement les `PlaylistMember` avec `canEdit = true` |

### Le systeme de permissions

Chaque membre d'une playlist a un flag `canEdit` :
- `canEdit = true` → peut ajouter, supprimer et reordonner des tracks
- `canEdit = false` → peut seulement voir la playlist (lecture seule)

Le createur peut toujours tout faire (il est automatiquement membre avec `canEdit = true`).

---

## Toutes les routes

Toutes les routes necessitent un token JWT.

### 1. `POST /api/playlists` — Creer une playlist

```json
{
  "name": "Chill Vibes",
  "description": "Pour se detendre",
  "isPublic": true,
  "licenseType": "OPEN"
}
```

Seul `name` est obligatoire. Par defaut : `isPublic = true`, `licenseType = OPEN`.

Le createur est automatiquement ajoute comme `PlaylistMember` avec `canEdit = true`.

### 2. `GET /api/playlists` — Lister les playlists publiques

### 3. `GET /api/playlists/:id` — Details d'une playlist

**Visibilite :** Si la playlist est privee (`isPublic = false`), seuls les membres peuvent la voir. Un non-membre recoit 404 (on ne revele pas l'existence de la playlist).

### 4. `PUT /api/playlists/:id` — Modifier (createur uniquement)

### 5. `DELETE /api/playlists/:id` — Supprimer (createur uniquement)

Suppression en cascade : toutes les tracks et membres sont supprimes.

### 6. `POST /api/playlists/:id/tracks` — Ajouter une track

```json
{
  "title": "Clair de Lune",
  "artist": "Debussy",
  "externalUrl": "https://open.spotify.com/track/..."
}
```

La track est ajoutee a la fin (position = max actuelle + 1). L'operation est dans une transaction pour eviter que deux ajouts simultanes obtiennent la meme position.

### 7. `DELETE /api/playlists/:id/tracks/:trackId` — Supprimer une track

Supprime la track et **decale toutes les tracks suivantes** d'une position vers le haut.

### 8. `PUT /api/playlists/:id/tracks/:trackId/position` — Reordonner

```json
{
  "newPosition": 0
}
```

Deplace une track de sa position actuelle vers `newPosition`. Toutes les tracks entre les deux positions sont decalees. Voir la section dediee plus bas.

### 9. `POST /api/playlists/:id/invite` — Inviter un utilisateur

```json
{
  "userId": "uuid-de-lutilisateur",
  "canEdit": true
}
```

Seul le createur peut inviter. `canEdit` est optionnel (defaut `true`).

### 10. `GET /api/playlists/:id/tracks` — Liste des tracks

Renvoie les tracks triees par `position` (ascendant).

---

## Comment fonctionne le reordonnancement (concurrence)

C'est la partie la plus critique du service. Voici l'algorithme complet.

### Le probleme

On a 3 tracks :
```
Track A — position 0
Track B — position 1
Track C — position 2
```

On veut deplacer C en position 0.

### L'algorithme

Tout se passe dans une **transaction Prisma** (`$transaction`) pour garantir l'atomicite.

**Etape 1 :** Recuperer la track et sa position actuelle.
```
Track C : oldPosition = 2, newPosition = 0
```

**Etape 2 :** Determiner le sens du deplacement.
- Si `oldPosition < newPosition` → deplacement vers le **bas** (la track descend)
- Si `oldPosition > newPosition` → deplacement vers le **haut** (la track monte)

Ici, `2 > 0` → deplacement vers le haut.

**Etape 3 :** Decaler les tracks entre les deux positions.

Pour un deplacement **vers le haut** (comme ici) :
```sql
-- Toutes les tracks entre newPosition (0) et oldPosition-1 (1)
-- sont decalees de +1
UPDATE "PlaylistTrack"
SET position = position + 1
WHERE playlistId = '...'
  AND position >= 0   -- newPosition
  AND position < 2;   -- oldPosition
```

Resultat intermediaire :
```
Track A — position 1  (etait 0, decalee de +1)
Track B — position 2  (etait 1, decalee de +1)
Track C — position 2  (pas encore bouge)
```

**Etape 4 :** Placer la track a sa nouvelle position.
```sql
UPDATE "PlaylistTrack"
SET position = 0
WHERE id = 'track-c-id';
```

Resultat final :
```
Track C — position 0  ✓
Track A — position 1  ✓
Track B — position 2  ✓
```

### Deplacement vers le bas (l'inverse)

Si on deplace A de la position 0 vers la position 2 :
```sql
-- Les tracks entre oldPosition+1 (1) et newPosition (2)
-- sont decalees de -1
UPDATE "PlaylistTrack"
SET position = position - 1
WHERE playlistId = '...'
  AND position > 0   -- oldPosition
  AND position <= 2; -- newPosition
```

### Code TypeScript

```typescript
async function reorderTrack(playlistId, trackId, newPosition, userId) {
  return prisma.$transaction(async (tx) => {
    const track = await tx.playlistTrack.findUnique({ where: { id: trackId } });
    const oldPosition = track.position;

    // Clamp pour ne pas depasser la taille de la playlist
    const trackCount = await tx.playlistTrack.count({ where: { playlistId } });
    const clampedNew = Math.min(newPosition, trackCount - 1);

    if (oldPosition < clampedNew) {
      // Deplacement vers le bas
      await tx.playlistTrack.updateMany({
        where: {
          playlistId,
          position: { gt: oldPosition, lte: clampedNew },
        },
        data: { position: { decrement: 1 } },
      });
    } else {
      // Deplacement vers le haut
      await tx.playlistTrack.updateMany({
        where: {
          playlistId,
          position: { gte: clampedNew, lt: oldPosition },
        },
        data: { position: { increment: 1 } },
      });
    }

    // Placer la track a sa nouvelle position
    await tx.playlistTrack.update({
      where: { id: trackId },
      data: { position: clampedNew },
    });
  });
}
```

### Pourquoi une transaction ?

Sans transaction, si deux utilisateurs reordonnent en meme temps :
1. Les deux lisent les memes positions
2. Les deux appliquent des decalages sur les memes ranges
3. Les positions deviennent incoherentes (doublons, trous)

La transaction garantit que les operations sont **serialisees** : la deuxieme requete attend que la premiere soit terminee avant de lire les positions.

### Suppression + reindex

Quand on supprime une track, on decale les positions suivantes :

```
Avant : A(0), B(1), C(2) — supprime B
Apres : A(0), C(1)        — C passe de 2 a 1
```

```typescript
await tx.playlistTrack.delete({ where: { id: trackId } });
await tx.playlistTrack.updateMany({
  where: { playlistId, position: { gt: track.position } },
  data: { position: { decrement: 1 } },
});
```

---

## Socket.io — temps reel

| Evenement | Direction | Payload | Quand |
|-----------|----------|---------|-------|
| `joinPlaylist` | Client → Serveur | `playlistId` | Le client ouvre une playlist |
| `leavePlaylist` | Client → Serveur | `playlistId` | Le client quitte |
| `playlistTrackAdded` | Serveur → Client | `{ playlistId, tracks }` | Track ajoutee |
| `playlistTrackRemoved` | Serveur → Client | `{ playlistId, tracks }` | Track supprimee |
| `playlistTrackReordered` | Serveur → Client | `{ playlistId, tracks }` | Track reordonnee |

A chaque modification, le serveur envoie la **liste complete des tracks** triee par position. Le client n'a qu'a remplacer sa liste locale.

---

## Les modeles en base de donnees

### Playlist

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `name` | String | Nom de la playlist |
| `description` | String? | Description |
| `creatorId` | String (FK → User) | Createur |
| `isPublic` | Boolean (default: true) | Visible dans la liste publique |
| `licenseType` | Enum | `OPEN` ou `INVITE_ONLY` |
| `createdAt` | DateTime | Date de creation |
| `updatedAt` | DateTime | Derniere modification |

### PlaylistTrack

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `playlistId` | String (FK → Playlist) | La playlist |
| `title` | String | Titre du morceau |
| `artist` | String | Artiste |
| `externalUrl` | String? | Lien externe |
| `addedById` | String (FK → User) | Qui a ajoute |
| `position` | Int | Ordre dans la playlist (0 = premier) |
| `createdAt` | DateTime | Date d'ajout |

### PlaylistMember

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `playlistId` | String (FK → Playlist) | La playlist |
| `userId` | String (FK → User) | L'utilisateur |
| `canEdit` | Boolean (default: true) | Peut modifier la playlist |
| `joinedAt` | DateTime | Date d'arrivee |

Contrainte unique sur `(playlistId, userId)`.

---

## Organisation des fichiers

```
backend/src/
├── routes/
│   └── playlist.routes.ts          ← Endpoints playlist (toutes protegees)
│
├── controllers/
│   └── playlist.controller.ts      ← Handlers HTTP + emission Socket.io
│
├── services/
│   └── playlist.service.ts         ← CRUD, add/remove/reorder avec transactions
│
├── schemas/
│   └── playlist.schema.ts          ← Schemas Zod (create, update, addTrack, reorder, invite)
│
└── tests/
    └── playlist.test.ts            ← 26 tests d'integration
```

---

## Les tests

26 tests repartis en 6 groupes :

### CRUD (7 tests)

| Test | Verifie |
|------|---------|
| Creer une playlist OPEN | 201, licenseType = OPEN |
| Creer une playlist INVITE_ONLY privee | 201, isPublic = false |
| Lister les publiques | Ne contient pas la playlist privee |
| Details | 200, nom du createur |
| Modifier (createur) | 200, nom mis a jour |
| Modifier (non-createur) | 403 |
| Playlist privee invisible pour un stranger | 404 |

### Invitations (4 tests)

| Test | Verifie |
|------|---------|
| Inviter un editeur (canEdit=true) | 201 |
| Inviter un lecteur (canEdit=false) | 201 |
| Invitation en double | 409 |
| Non-createur ne peut pas inviter | 403 |

### Tracks et permissions (6 tests)

| Test | Verifie |
|------|---------|
| Ajout sur OPEN (par un stranger) | 201, position 0 |
| Ajout sur INVITE_ONLY (par un editeur) | 201, position 0 |
| Auto-increment des positions | Positions 0, 1, 2 |
| Lecteur ne peut pas ajouter | 403 |
| Stranger ne peut pas ajouter sur INVITE_ONLY | 403 |
| Liste triee par position | Ordre A, B, C |

### Reordonnancement (4 tests)

| Test | Verifie |
|------|---------|
| Deplacer C de 2 vers 0 | Ordre: C, A, B |
| Deplacer C de 0 vers 2 | Ordre: A, B, C |
| Deplacer A de 0 vers 1 | Ordre: B, A, C |
| Lecteur ne peut pas reordonner | 403 |

### Suppression de tracks (2 tests)

| Test | Verifie |
|------|---------|
| Supprimer une track du milieu | Positions reindexees (0, 1) |
| Lecteur ne peut pas supprimer | 403 |

### Suppression de playlist (3 tests)

| Test | Verifie |
|------|---------|
| Non-createur ne peut pas supprimer | 403 |
| Createur supprime (cascade) | 204 |
| Playlist supprimee → 404 | 404 |

---

## Codes HTTP utilises

| Code | Signification | Quand |
|------|--------------|-------|
| 200 | OK | Get, update, reorder |
| 201 | Cree | Create playlist, add track, invite |
| 204 | Pas de contenu | Delete playlist, delete track |
| 403 | Interdit | Pas editeur, pas le createur |
| 404 | Non trouve | Playlist/track inexistante, playlist privee pour non-membre |
| 409 | Conflit | Membre deja invite |

---

## Phase 4 terminee

L'editeur de playlist collaboratif est en place :
- [x] CRUD complet sur les playlists
- [x] Ajout / suppression / reordonnancement de tracks
- [x] Transactions Prisma pour la concurrence sur les positions
- [x] Systeme d'invitation avec permissions (canEdit)
- [x] 2 types de licence (OPEN, INVITE_ONLY)
- [x] Visibilite publique/privee
- [x] Socket.io temps reel (playlistTrackAdded/Removed/Reordered)
- [x] Annotations Swagger sur toutes les routes
- [x] 26 tests d'integration qui passent
- [x] Total : 77 tests (16 auth + 14 user + 21 event + 26 playlist)
