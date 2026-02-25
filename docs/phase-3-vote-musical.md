# Phase 3 — Service de vote musical en temps reel

## Ce qu'on a construit

Un systeme de file d'attente musicale collaborative pour des evenements en direct. Le principe :

1. Un utilisateur cree un **evenement** (soiree, concert, bar...)
2. Les participants **proposent des morceaux** (tracks)
3. Tout le monde **vote** pour les morceaux qu'il veut entendre
4. La liste se trie automatiquement par nombre de votes
5. Les changements sont **diffuses en temps reel** via Socket.io

---

## Comment ca marche (vue d'ensemble)

```
                    Evenement "Soiree Jazz"
                    ┌─────────────────────────────┐
                    │                             │
  Participant A ──> │  1. So What     (5 votes)   │ ← la liste se trie
  Participant B ──> │  2. Take Five   (3 votes)   │   automatiquement
  Participant C ──> │  3. Blue Train  (1 vote)    │   par nombre de votes
                    │                             │
                    └─────────────────────────────┘
                              │
                    Socket.io │ broadcast en temps reel
                              ▼
                    Tous les clients connectes
                    recoivent la liste mise a jour
```

### Les 3 types de licence

Chaque evenement a un **type de licence** qui controle qui peut voter et ajouter des tracks :

| Type | Qui peut participer | Conditions |
|------|-------------------|------------|
| `OPEN` | Tout le monde | Aucune restriction |
| `INVITE_ONLY` | Uniquement les membres invites | Il faut etre dans la table `EventMember` |
| `LOCATION_TIME` | Utilisateurs proches et dans le creneau | Verification de la distance (< 5 km) et de l'heure |

---

## Toutes les routes

Toutes les routes necessitent un token JWT dans le header `Authorization: Bearer <token>`.

### 1. `POST /api/events` — Creer un evenement

**Ce qu'on envoie :**
```json
{
  "name": "Soiree Jazz",
  "description": "Une soiree chill au bar",
  "isPublic": true,
  "licenseType": "OPEN",
  "startTime": "2026-03-01T20:00:00.000Z",
  "endTime": "2026-03-02T02:00:00.000Z",
  "latitude": 48.8566,
  "longitude": 2.3522
}
```

Seul le champ `name` est obligatoire. Le reste a des valeurs par defaut :
- `isPublic` : `true`
- `licenseType` : `OPEN`
- `startTime`, `endTime`, `latitude`, `longitude` : `null`

**Ce qui se passe :**
1. L'evenement est cree en base
2. Le createur est automatiquement ajoute comme `EventMember` avec le role `CREATOR`

**Ce qu'on recoit :**
```json
{
  "success": true,
  "data": {
    "id": "uuid...",
    "name": "Soiree Jazz",
    "description": "Une soiree chill au bar",
    "creatorId": "uuid-du-createur",
    "isPublic": true,
    "licenseType": "OPEN",
    "startTime": "2026-03-01T20:00:00.000Z",
    "endTime": "2026-03-02T02:00:00.000Z",
    "latitude": 48.8566,
    "longitude": 2.3522,
    "createdAt": "2026-02-25T..."
  }
}
```

### 2. `GET /api/events` — Lister les evenements publics

Renvoie tous les evenements ou `isPublic = true`, tries du plus recent au plus ancien. Chaque evenement inclut le nom du createur et le nombre de membres/tracks.

### 3. `GET /api/events/:id` — Details d'un evenement

Renvoie les infos completes d'un evenement avec le createur et les compteurs.

### 4. `PUT /api/events/:id` — Modifier un evenement

**Seul le createur peut modifier.** Sinon → 403.

Tous les champs sont optionnels (meme principe que `PUT /api/users/me`).

### 5. `DELETE /api/events/:id` — Supprimer un evenement

**Seul le createur peut supprimer.** Sinon → 403.

La suppression est en **cascade** : quand on supprime un evenement, tous les tracks, votes et membres associes sont automatiquement supprimes (grace au `onDelete: Cascade` dans le schema Prisma).

### 6. `POST /api/events/:id/join` — Rejoindre un evenement

**Ce qui se passe :**
1. Verifier que l'evenement existe (404 sinon)
2. Verifier qu'on n'est pas deja membre (409 sinon)
3. Si l'evenement est `INVITE_ONLY` → 403 (on ne peut pas rejoindre soi-meme)
4. Sinon, on cree un `EventMember` avec le role `PARTICIPANT`

### 7. `POST /api/events/:id/tracks` — Proposer un morceau

**Ce qu'on envoie :**
```json
{
  "title": "So What",
  "artist": "Miles Davis",
  "externalUrl": "https://open.spotify.com/track/..."
}
```

`title` et `artist` sont obligatoires. `externalUrl` est optionnel (lien Spotify, YouTube, etc.).

**Restriction INVITE_ONLY :** Si l'evenement est sur invitation, seuls les membres peuvent ajouter des tracks.

**Temps reel :** Apres l'ajout, la liste complete des tracks est envoyee via Socket.io a tous les clients connectes a la room de l'evenement (evenement `trackAdded`).

### 8. `GET /api/events/:id/tracks` — Liste des morceaux

Renvoie les tracks **triees par nombre de votes** (du plus vote au moins vote). Chaque track inclut qui l'a ajoutee.

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid...",
      "title": "So What",
      "artist": "Miles Davis",
      "externalUrl": null,
      "voteCount": 5,
      "addedBy": { "id": "uuid...", "name": "Jean" },
      "createdAt": "2026-02-25T..."
    },
    {
      "id": "uuid...",
      "title": "Take Five",
      "artist": "Dave Brubeck",
      "voteCount": 2,
      "addedBy": { "id": "uuid...", "name": "Marie" },
      "createdAt": "2026-02-25T..."
    }
  ]
}
```

### 9. `POST /api/events/:id/tracks/:trackId/vote` — Voter pour un morceau

**Ce qu'on envoie :** (optionnel, uniquement pour les evenements `LOCATION_TIME`)
```json
{
  "latitude": 48.8570,
  "longitude": 2.3525
}
```

**Ce qui se passe :**
1. On recupere la track et son evenement
2. On verifie les restrictions selon le type de licence (voir section dediee plus bas)
3. On lance une **transaction Prisma** pour :
   - Verifier que l'utilisateur n'a pas deja vote (409 sinon)
   - Creer le vote
   - Incrementer le `voteCount` sur la track
4. La liste mise a jour est envoyee via Socket.io (evenement `trackVoted`)

---

## La logique de vote expliquee

### Pourquoi une transaction ?

Le vote est l'operation la plus sensible du systeme. Sans transaction, deux requetes simultanees pourraient :
1. Toutes les deux verifier qu'il n'y a pas de vote existant → OK
2. Toutes les deux creer un vote → doublon
3. Toutes les deux incrementer `voteCount` → compte faux

La **transaction Prisma** (`$transaction`) garantit que ces 3 etapes sont **atomiques** : si deux requetes arrivent en meme temps, la deuxieme attend que la premiere finisse, puis voit le vote existant et refuse.

```typescript
const result = await prisma.$transaction(async (tx) => {
  // 1. Verifier le vote existant (dans la transaction)
  const existingVote = await tx.vote.findUnique({
    where: { trackId_userId: { trackId, userId } },
  });
  if (existingVote) {
    throw new Error('You already voted for this track');
  }

  // 2. Creer le vote
  await tx.vote.create({ data: { trackId, userId } });

  // 3. Incrementer le compteur
  const updatedTrack = await tx.track.update({
    where: { id: trackId },
    data: { voteCount: { increment: 1 } },
  });

  return updatedTrack;
});
```

**Double securite :** en plus de la transaction, la table `Vote` a une contrainte `@@unique([trackId, userId])` au niveau de la base de donnees. Meme si la transaction echouait, PostgreSQL refuserait le doublon.

### Verification INVITE_ONLY

Avant de voter, on verifie que l'utilisateur est bien dans la table `EventMember` pour cet evenement. Si ce n'est pas le cas → 403.

### Verification LOCATION_TIME

Deux verifications :

**1. Le creneau horaire :** On compare `new Date()` avec `startTime` et `endTime` de l'evenement. Si on est en dehors → 403.

**2. La distance :** On utilise la **formule de Haversine** pour calculer la distance entre les coordonnees de l'utilisateur et celles de l'evenement :

```typescript
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

Si la distance depasse **5 km** (`MAX_DISTANCE_KM`), le vote est refuse. Si l'utilisateur n'envoie pas ses coordonnees alors que l'evenement en a → 400.

---

## Socket.io — temps reel

### Comment ca fonctionne

Le serveur Socket.io est attache au serveur HTTP dans `index.ts`. Il utilise des **rooms** pour isoler les evenements les uns des autres.

```
Client mobile/web
    │
    │  socket.emit('joinEvent', 'event-id-123')
    │  → Le client rejoint la room "event:event-id-123"
    │
    │  ... quelqu'un ajoute une track ou vote ...
    │
    │  socket.on('trackAdded', (data) => { ... })
    │  socket.on('trackVoted', (data) => { ... })
    │  → Le client recoit la liste mise a jour
```

### Les evenements Socket.io

| Evenement | Direction | Payload | Quand |
|-----------|----------|---------|-------|
| `joinEvent` | Client → Serveur | `eventId` (string) | Le client veut suivre un evenement |
| `leaveEvent` | Client → Serveur | `eventId` (string) | Le client quitte la page |
| `trackAdded` | Serveur → Client | `{ eventId, tracks }` | Une nouvelle track est ajoutee |
| `trackVoted` | Serveur → Client | `{ eventId, tracks }` | Un vote est enregistre |

Les evenements `trackAdded` et `trackVoted` renvoient **toute la liste des tracks** triee par votes, pas juste la track modifiee. Ca simplifie le client qui n'a qu'a remplacer sa liste.

### Le typage

Les evenements Socket.io sont **strictement types** avec des interfaces TypeScript :

```typescript
interface ServerToClientEvents {
  trackAdded: (data: { eventId: string; tracks: unknown[] }) => void;
  trackVoted: (data: { eventId: string; tracks: unknown[] }) => void;
}

interface ClientToServerEvents {
  joinEvent: (eventId: string) => void;
  leaveEvent: (eventId: string) => void;
}
```

---

## Les modeles en base de donnees

### Event

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `name` | String | Nom de l'evenement |
| `description` | String? | Description optionnelle |
| `creatorId` | String (FK → User) | Qui a cree l'evenement |
| `isPublic` | Boolean (default: true) | Visible dans la liste publique |
| `licenseType` | Enum | `OPEN`, `INVITE_ONLY` ou `LOCATION_TIME` |
| `startTime` | DateTime? | Debut du creneau (pour LOCATION_TIME) |
| `endTime` | DateTime? | Fin du creneau |
| `latitude` | Float? | Latitude de l'evenement |
| `longitude` | Float? | Longitude de l'evenement |
| `createdAt` | DateTime | Date de creation |

### Track

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `eventId` | String (FK → Event) | L'evenement associe |
| `title` | String | Titre du morceau |
| `artist` | String | Artiste |
| `externalUrl` | String? | Lien externe (Spotify, YouTube...) |
| `addedById` | String (FK → User) | Qui a propose ce morceau |
| `voteCount` | Int (default: 0) | Nombre de votes (denormalise pour le tri) |
| `createdAt` | DateTime | Date d'ajout |

**Pourquoi `voteCount` est directement sur Track ?** C'est de la **denormalisation** : au lieu de compter les votes a chaque fois avec un `COUNT(*)`, on stocke le total directement. Ca rend le tri par votes instantane (un simple `ORDER BY voteCount DESC`) au lieu de faire une jointure + aggregation a chaque requete. Le compteur est mis a jour dans la meme transaction que le vote, donc il reste toujours coherent.

### Vote

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `trackId` | String (FK → Track) | La track votee |
| `userId` | String (FK → User) | Qui a vote |
| `createdAt` | DateTime | Date du vote |

**Contrainte unique** sur `(trackId, userId)` : un utilisateur ne peut voter qu'une seule fois par track.

### EventMember

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `eventId` | String (FK → Event) | L'evenement |
| `userId` | String (FK → User) | L'utilisateur |
| `role` | Enum | `CREATOR`, `INVITED` ou `PARTICIPANT` |
| `joinedAt` | DateTime | Date d'arrivee |

**Contrainte unique** sur `(eventId, userId)` : un utilisateur ne peut etre membre qu'une seule fois.

---

## Organisation des fichiers (nouveaux fichiers)

```
backend/src/
├── config/
│   └── socket.ts                    ← Serveur Socket.io (init, rooms, getIO)
│
├── routes/
│   └── event.routes.ts              ← Endpoints evenements + tracks + votes
│
├── controllers/
│   └── event.controller.ts          ← Handlers HTTP + emission Socket.io
│
├── services/
│   ├── event.service.ts             ← CRUD events, join, add track, list tracks
│   └── vote.service.ts              ← Logique de vote (transaction, licences, distance)
│
├── schemas/
│   └── event.schema.ts              ← Schemas Zod (createEvent, addTrack, vote...)
│
└── tests/
    └── event.test.ts                ← 21 tests d'integration
```

**Fichiers modifies :**
- `app.ts` : ajout de la route `/api/events`
- `index.ts` : creation du serveur HTTP + initialisation Socket.io

### Pourquoi deux fichiers service ?

On a separe `event.service.ts` (CRUD classique) et `vote.service.ts` (logique de vote) parce que le vote a une logique metier plus complexe (transaction, verification de licence, calcul de distance). Ca evite d'avoir un seul fichier trop long et ca separe clairement les responsabilites.

### Le flux d'un vote

```
POST /api/events/:id/tracks/:trackId/vote
Header: Authorization: Bearer eyJhbG...
Body: { "latitude": 48.85, "longitude": 2.35 }
    ↓
auth.middleware.ts → verifie le JWT
    ↓
validate.middleware.ts → valide le body avec voteSchema (Zod)
    ↓
event.controller.ts → extrait eventId, trackId, userId
    ↓
vote.service.ts → voteForTrack()
    ├── Recupere la track + l'evenement
    ├── Verifie la licence (OPEN / INVITE_ONLY / LOCATION_TIME)
    ├── Lance la transaction :
    │   ├── Vote existant ? → 409
    │   ├── Creer le vote
    │   └── Incrementer voteCount
    └── Retourne la track mise a jour
    ↓
event.controller.ts → emet "trackVoted" via Socket.io
    ↓
Reponse JSON { success: true, data: { ...track, voteCount: 3 } }
```

---

## Les tests

21 tests d'integration repartis en 5 groupes :

### CRUD Events (6 tests)

| Test | Ce qu'il verifie |
|------|------------------|
| Creer un evenement OPEN | 201, licenseType par defaut = OPEN |
| Creer un evenement INVITE_ONLY | 201, licenseType = INVITE_ONLY |
| Lister les evenements publics | 200, au moins 1 evenement |
| Details d'un evenement | 200, nom du createur inclus |
| Modifier (createur) | 200, nom mis a jour |
| Modifier (non-createur) | 403 |

### Join (3 tests)

| Test | Ce qu'il verifie |
|------|------------------|
| Rejoindre un event OPEN | 201, role = PARTICIPANT |
| Rejoindre en double | 409 |
| Rejoindre un event INVITE_ONLY | 403 |

### Tracks (4 tests)

| Test | Ce qu'il verifie |
|------|------------------|
| Ajouter une track (OPEN) | 201, voteCount = 0 |
| Ajouter une deuxieme track | 201 |
| Ajouter sur INVITE_ONLY (non-membre) | 403 |
| Lister les tracks | 200, 2 tracks |

### Voting (5 tests)

| Test | Ce qu'il verifie |
|------|------------------|
| Voter | 200, voteCount = 1 |
| Double vote | 409 |
| Vote par un autre user | 200, voteCount = 2 |
| Vote INVITE_ONLY (non-membre) | 403 |
| Tri par votes | La track avec 2 votes est en premier |

### Delete (3 tests)

| Test | Ce qu'il verifie |
|------|------------------|
| Supprimer (non-createur) | 403 |
| Supprimer (createur) | 204, cascade |
| Acceder apres suppression | 404 |

---

## Codes HTTP utilises

| Code | Signification | Quand |
|------|--------------|-------|
| 200 | OK | Get event, update event, vote, list tracks |
| 201 | Cree | Create event, join event, add track |
| 204 | Pas de contenu | Delete event |
| 400 | Mauvaise requete | Donnees invalides, localisation manquante |
| 403 | Interdit | Pas le createur, pas membre, hors zone, hors creneau |
| 404 | Non trouve | Evenement ou track inexistant |
| 409 | Conflit | Deja membre, deja vote |

---

## Phase 3 terminee

Le service de vote musical est en place :
- [x] CRUD complet sur les evenements
- [x] Systeme de tracks avec ajout et tri par votes
- [x] Vote avec transaction Prisma (anti-doublon, anti-race-condition)
- [x] 3 types de licence (OPEN, INVITE_ONLY, LOCATION_TIME)
- [x] Verification de distance via formule de Haversine
- [x] Socket.io pour le temps reel (trackAdded, trackVoted)
- [x] Annotations Swagger sur toutes les routes
- [x] 21 tests d'integration qui passent
- [x] Total : 51 tests (16 auth + 14 user + 21 event)
