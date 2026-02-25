# Phase 2 — Profils utilisateurs et système d'amis

## Ce qu'on a construit

Un système de profils utilisateurs avec :
- Consultation et modification de son propre profil
- Consultation du profil d'un autre utilisateur (avec des règles de visibilité)
- Trois niveaux de visibilité sur les infos du profil (public, amis uniquement, privé)
- Préférences musicales
- Système de demandes d'amis (envoi, acceptation, liste)

---

## Comment ça marche (vue d'ensemble)

L'idée centrale, c'est que chaque utilisateur a trois "zones" d'information sur son profil :

```
┌─────────────────────────────────────┐
│            Mon profil               │
│                                     │
│  publicInfo    → visible par TOUS   │
│  friendsInfo   → visible par mes    │
│                  amis uniquement     │
│  privateInfo   → visible par MOI    │
│                  uniquement          │
│  musicPreferences → visible par TOUS│
└─────────────────────────────────────┘
```

Quand quelqu'un consulte le profil d'un autre utilisateur, le serveur vérifie la relation entre les deux et filtre ce qu'il renvoie :

```
                              Qui regarde ?
                     ┌────────────┬──────────────┐
                     │  Inconnu   │    Ami        │
  ┌──────────────────┼────────────┼──────────────┤
  │ publicInfo       │    ✅      │     ✅       │
  │ friendsInfo      │    ❌      │     ✅       │
  │ privateInfo      │    ❌      │     ❌       │
  │ musicPreferences │    ✅      │     ✅       │
  └──────────────────┴────────────┴──────────────┘

  Seul l'utilisateur lui-même voit TOUT (y compris privateInfo).
```

---

## Toutes les routes

Toutes les routes de cette phase nécessitent un token JWT dans le header `Authorization: Bearer <token>`. Sans token → 401.

### 1. `GET /api/users/me` — Mon profil

Renvoie toutes les informations de l'utilisateur connecté, y compris les champs privés.

**Ce qu'on reçoit :**
```json
{
  "success": true,
  "data": {
    "id": "uuid...",
    "email": "jean@example.com",
    "name": "Jean Dupont",
    "emailVerified": true,
    "publicInfo": "Fan de jazz",
    "friendsInfo": "Dispo le samedi pour des concerts",
    "privateInfo": "Mon journal secret",
    "musicPreferences": ["jazz", "rock"],
    "createdAt": "2026-02-25T10:00:00.000Z"
  }
}
```

### 2. `PUT /api/users/me` — Modifier mon profil

**Ce qu'on envoie :** (tous les champs sont optionnels)
```json
{
  "name": "Jean-Pierre",
  "publicInfo": "Fan de jazz et de rock",
  "friendsInfo": "Dispo le week-end",
  "privateInfo": "Note personnelle",
  "musicPreferences": ["jazz", "rock", "electro"]
}
```

**Validation Zod :**
- `name` : minimum 2 caractères (optionnel)
- `publicInfo`, `friendsInfo`, `privateInfo` : string ou null (optionnels)
- `musicPreferences` : tableau de strings (optionnel)

On peut envoyer un seul champ si on veut modifier seulement celui-là.

**Ce qu'on reçoit :** Le profil mis à jour.

### 3. `GET /api/users/:id` — Voir le profil d'un autre

C'est la route où la logique de visibilité s'applique.

**Exemple — Un inconnu regarde mon profil :**
```json
{
  "success": true,
  "data": {
    "id": "uuid...",
    "name": "Jean Dupont",
    "publicInfo": "Fan de jazz",
    "musicPreferences": ["jazz", "rock"]
  }
}
```
→ `friendsInfo` et `privateInfo` ne sont pas renvoyés.

**Exemple — Un ami regarde mon profil :**
```json
{
  "success": true,
  "data": {
    "id": "uuid...",
    "name": "Jean Dupont",
    "publicInfo": "Fan de jazz",
    "friendsInfo": "Dispo le samedi pour des concerts",
    "musicPreferences": ["jazz", "rock"]
  }
}
```
→ `friendsInfo` est visible, mais `privateInfo` reste caché (jamais visible par les autres).

**Si je regarde mon propre profil via cette route**, tout est visible (comme `/me`).

### 4. `POST /api/users/friend-requests/:friendId` — Envoyer une demande d'ami

**Pas de body**, l'ID de la personne est dans l'URL.

**Ce qui se passe :**
1. Vérification qu'on ne s'envoie pas une demande à soi-même (400)
2. Vérification que l'utilisateur cible existe (404)
3. Vérification qu'il n'y a pas déjà une relation dans un sens ou l'autre (409)
4. Création d'une entrée `Friendship` avec le statut `PENDING`

**Ce qu'on reçoit :**
```json
{
  "success": true,
  "data": {
    "id": "uuid...",
    "userId": "mon-id",
    "friendId": "son-id",
    "status": "PENDING",
    "createdAt": "2026-02-25T10:00:00.000Z"
  }
}
```

### 5. `PUT /api/users/friend-requests/:friendId/accept` — Accepter une demande

Le `:friendId` ici c'est l'ID de la personne qui nous a envoyé la demande.

**Ce qui se passe :**
1. On cherche une demande `PENDING` où `friendId` (l'expéditeur) est celui dans l'URL et `userId` (le destinataire) c'est nous
2. Si trouvée, on passe le statut à `ACCEPTED`
3. À partir de maintenant, la visibilité `friendsInfo` est débloquée dans les deux sens

**Erreur 404** si aucune demande en attente n'existe.

### 6. `GET /api/users/me/friends` — Ma liste d'amis

Renvoie tous les utilisateurs avec qui on a une relation `ACCEPTED`.

**Ce qu'on reçoit :**
```json
{
  "success": true,
  "data": [
    { "id": "uuid...", "name": "Marie", "email": "marie@test.com" },
    { "id": "uuid...", "name": "Paul", "email": "paul@test.com" }
  ]
}
```

La logique est un peu subtile : une amitié peut être dans le sens A→B ou B→A, mais dans les deux cas les deux personnes sont amies. La fonction `getFriends` parcourt toutes les relations `ACCEPTED` où on est soit `userId` soit `friendId`, et renvoie l'autre personne à chaque fois.

---

## La logique de visibilité expliquée

C'est le cœur de cette phase. Voici le code simplifié de la fonction `getUserProfile` :

```typescript
export async function getUserProfile(targetUserId, requestingUserId) {
  const user = await prisma.user.findUnique({ where: { id: targetUserId } });

  // Soi-même → tout voir
  if (targetUserId === requestingUserId) {
    return { id, name, publicInfo, friendsInfo, privateInfo, musicPreferences };
  }

  // Sinon → vérifier si amis
  const friends = await areFriends(requestingUserId, targetUserId);

  return {
    id: user.id,
    name: user.name,
    publicInfo: user.publicInfo,
    friendsInfo: friends ? user.friendsInfo : undefined,  // visible que si amis
    // privateInfo n'est JAMAIS renvoyé aux autres
    musicPreferences: user.musicPreferences,
  };
}
```

La fonction `areFriends` vérifie s'il existe une relation `ACCEPTED` entre les deux utilisateurs, dans les deux sens :

```typescript
async function areFriends(userA, userB) {
  const friendship = await prisma.friendship.findFirst({
    where: {
      status: 'ACCEPTED',
      OR: [
        { userId: userA, friendId: userB },
        { userId: userB, friendId: userA },
      ],
    },
  });
  return !!friendship;
}
```

**Pourquoi `OR` dans les deux sens ?** Parce que si A envoie une demande à B, c'est stocké comme `userId: A, friendId: B`. Mais quand B veut savoir s'il est ami avec A, il faut vérifier les deux directions.

---

## Le modèle Friendship en base

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique |
| `userId` | String (FK → User) | Celui qui a envoyé la demande |
| `friendId` | String (FK → User) | Celui qui reçoit la demande |
| `status` | String | `PENDING` ou `ACCEPTED` |
| `createdAt` | DateTime | Date de création de la demande |

**Contrainte unique** sur `(userId, friendId)` : on ne peut pas envoyer deux fois la même demande. Le service vérifie aussi l'inverse (`friendId → userId`) pour éviter les doublons croisés.

### Champs ajoutés au modèle User

| Champ | Type | Description |
|-------|------|-------------|
| `publicInfo` | String (nullable) | Info visible par tout le monde |
| `friendsInfo` | String (nullable) | Info visible uniquement par les amis |
| `privateInfo` | String (nullable) | Info visible uniquement par soi-même |
| `musicPreferences` | String[] | Liste des genres musicaux préférés |

---

## Organisation des fichiers (nouveaux fichiers)

```
backend/src/
├── routes/
│   └── user.routes.ts              ← Endpoints profil + amis (toutes protégées)
│
├── controllers/
│   └── user.controller.ts          ← Reçoit la requête, appelle le service
│
├── services/
│   └── user.service.ts             ← Logique métier (visibilité, amitié)
│
├── schemas/
│   └── user.schema.ts              ← Schéma Zod pour updateProfile
│
└── tests/
    └── user.test.ts                ← 14 tests d'intégration
```

Le pattern reste le même que pour l'authentification : Routes → Controllers → Services. Pas de couche supplémentaire.

### Le flux d'une requête vers `/api/users/:id`

```
GET /api/users/abc-123
Header: Authorization: Bearer eyJhbG...
    ↓
auth.middleware.ts → vérifie le JWT, identifie le "requesting user"
    ↓
user.routes.ts → route /:id → appelle getUserProfile
    ↓
user.controller.ts → extrait l'ID de l'URL + l'ID du JWT
    ↓
user.service.ts → getUserProfile(targetId, requestingId)
    ↓
    ├── Est-ce moi ? → renvoie tout
    ├── Sommes-nous amis ? → renvoie publicInfo + friendsInfo
    └── Sinon → renvoie publicInfo uniquement
    ↓
Réponse JSON { success: true, data: { ... } }
```

---

## Les tests

14 tests d'intégration qui vérifient le profil et la visibilité :

| Test | Ce qu'il vérifie |
|------|------------------|
| GET /me — avec token | Renvoie le profil complet de l'utilisateur connecté |
| GET /me — sans token | Renvoie 401 |
| PUT /me — modifier les champs | Les champs sont bien mis à jour (publicInfo, friendsInfo, privateInfo, musicPreferences) |
| PUT /me — user B | Prépare les données de B pour les tests de visibilité |
| GET /:id — son propre profil | Voit tout (publicInfo + friendsInfo + privateInfo) |
| GET /:id — inconnu | Ne voit que publicInfo (friendsInfo et privateInfo sont undefined) |
| Envoyer demande d'ami | Crée une Friendship avec statut PENDING, renvoie 201 |
| Demande en double | Renvoie 409 (conflit) |
| Demande à soi-même | Renvoie 400 |
| PENDING ≠ ami | Même après envoi de la demande, friendsInfo reste invisible |
| Accepter la demande | Passe le statut à ACCEPTED, renvoie 200 |
| Ami voit friendsInfo | Après acceptation, friendsInfo est visible |
| Visibilité bidirectionnelle | L'amitié fonctionne dans les deux sens |
| Liste d'amis | GET /me/friends renvoie la liste correcte |

**Point important :** les tests suivent un scénario complet. D'abord on crée deux utilisateurs, puis on vérifie la visibilité quand ils ne sont pas amis, puis on envoie une demande, on accepte, et on re-vérifie que la visibilité a changé.

---

## Codes HTTP utilisés

| Code | Signification | Quand |
|------|--------------|-------|
| 200 | OK | Profil récupéré, profil mis à jour, demande acceptée, liste d'amis |
| 201 | Créé | Demande d'ami envoyée |
| 400 | Mauvaise requête | Demande d'ami à soi-même, données invalides |
| 401 | Non autorisé | Pas de token ou token invalide |
| 404 | Non trouvé | Utilisateur inexistant, pas de demande en attente |
| 409 | Conflit | Demande d'ami déjà existante |

---

## Le schéma Zod de validation

```typescript
const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  publicInfo: z.string().nullable().optional(),
  friendsInfo: z.string().nullable().optional(),
  privateInfo: z.string().nullable().optional(),
  musicPreferences: z.array(z.string()).optional(),
});
```

Tout est optionnel parce que c'est un `PUT` partiel : on peut ne modifier qu'un seul champ à la fois. Les champs texte acceptent `null` (pour pouvoir "vider" un champ).

---

## Phase 2 terminée

Le système de profils utilisateurs est en place :
- [x] Consultation de son propre profil (`GET /me`)
- [x] Modification de son profil (`PUT /me`)
- [x] Consultation du profil des autres avec visibilité (`GET /:id`)
- [x] Trois niveaux : public, amis uniquement, privé
- [x] Préférences musicales
- [x] Demandes d'amis (envoi, acceptation, liste)
- [x] Annotations Swagger sur toutes les routes
- [x] 14 tests d'intégration qui passent
