# Schéma de la base de données — Music Room

La base de données est une instance PostgreSQL hébergée sur Supabase. Le schéma est défini dans `backend/prisma/schema.prisma` et géré via les migrations Prisma.

## Vue d'ensemble du schéma

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
         │ L'utilisateur crée/participe à...
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
│ (paire │
│ unique)│
└────────┘
```

## Explication des tables

### User

La table centrale. Stocke les informations d'authentification et les données de profil.

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | UUID | Clé primaire, auto-générée |
| `email` | String (unique) | Email de connexion |
| `password` | String? | Hash bcrypt. Null si l'utilisateur s'est inscrit uniquement via Google |
| `name` | String | Nom d'affichage |
| `googleId` | String? (unique) | Identifiant Google OAuth, null si non lié |
| `emailVerified` | Boolean | Si l'email a été confirmé |
| `isAdmin` | Boolean | Flag administrateur |
| `isPremium` | Boolean | Flag abonnement premium (contrôle la création de playlists) |
| `publicInfo` | String? | Infos de profil visibles par tout le monde |
| `friendsInfo` | String? | Infos de profil visibles uniquement par les amis |
| `privateInfo` | String? | Infos de profil visibles uniquement par l'utilisateur |
| `musicPreferences` | String[] | Tableau de préférences musicales par genre |
| `verificationCode` | String? | Code de vérification email à 6 chiffres |
| `verificationCodeExpiry` | DateTime? | Expiration du code (15 min après génération) |
| `resetToken` | String? | Token de réinitialisation du mot de passe |
| `resetTokenExpiry` | DateTime? | Expiration du token de réinitialisation (30 min) |

Le système de visibilité du profil utilise trois niveaux : `publicInfo` (visible par tous), `friendsInfo` (uniquement les amis acceptés), `privateInfo` (uniquement l'utilisateur lui-même). Le backend vérifie la relation entre le visiteur et le propriétaire du profil avant de décider quels champs inclure dans la réponse.

### Friendship

Suit les relations d'amitié entre deux utilisateurs.

| Colonne | Type | Description |
|---------|------|-------------|
| `userId` | UUID (FK → User) | L'utilisateur qui a envoyé la demande |
| `friendId` | UUID (FK → User) | L'utilisateur qui a reçu la demande |
| `status` | String | `PENDING` (demande envoyée) ou `ACCEPTED` (amis) |

**Contrainte d'unicité** : `@@unique([userId, friendId])` — impossible d'envoyer la même demande deux fois.

Une amitié commence toujours en `PENDING` quand l'utilisateur A envoie une demande à l'utilisateur B. Quand B accepte, le statut passe à `ACCEPTED`. Pour vérifier si deux utilisateurs sont amis, le backend cherche une amitié `ACCEPTED` dans les deux sens.

### Event

Une session de vote musical où les participants ajoutent des morceaux et votent.

| Colonne | Type | Description |
|---------|------|-------------|
| `name` | String | Nom de l'événement |
| `creatorId` | UUID (FK → User) | Qui l'a créé |
| `isPublic` | Boolean | S'il apparaît dans le fil public |
| `licenseType` | Enum | `OPEN`, `INVITE_ONLY`, ou `LOCATION_TIME` |
| `startTime` / `endTime` | DateTime? | Fenêtre temporelle pour les événements LOCATION_TIME |
| `latitude` / `longitude` | Float? | Coordonnées GPS pour les événements LOCATION_TIME |

**Types de licence** :
- `OPEN` : n'importe qui peut rejoindre, ajouter des morceaux et voter
- `INVITE_ONLY` : seuls les membres explicitement invités peuvent participer
- `LOCATION_TIME` : il faut être dans un rayon de 5 km de l'événement ET dans la fenêtre temporelle

### Track

Un morceau de musique ajouté à un événement pour le vote.

| Colonne | Type | Description |
|---------|------|-------------|
| `eventId` | UUID (FK → Event) | À quel événement appartient ce morceau |
| `title` | String | Titre du morceau |
| `artist` | String | Nom de l'artiste |
| `externalUrl` | String? | Lien optionnel (Spotify, YouTube...) |
| `addedById` | UUID (FK → User) | Qui l'a ajouté |
| `voteCount` | Int | Compteur de votes mis en cache (dénormalisé pour la performance) |

`voteCount` est un champ dénormalisé — il duplique des données qui pourraient être calculées à partir de la table `Vote`. Cela évite d'exécuter un `COUNT(*)` à chaque requête de liste de morceaux. Il est mis à jour de manière atomique dans une transaction Prisma quand un vote est ajouté ou supprimé.

**Suppression en cascade** : quand un événement est supprimé, tous ses morceaux sont automatiquement supprimés.

### Vote

Enregistre qu'un utilisateur a voté pour un morceau spécifique. Fonctionne en toggle : voter à nouveau supprime le vote.

| Colonne | Type | Description |
|---------|------|-------------|
| `trackId` | UUID (FK → Track) | Le morceau pour lequel on vote |
| `userId` | UUID (FK → User) | Qui a voté |

**Contrainte d'unicité** : `@@unique([trackId, userId])` — un vote par utilisateur par morceau, appliqué au niveau de la base de données.

### EventMember

Lie les utilisateurs aux événements avec un rôle.

| Colonne | Type | Description |
|---------|------|-------------|
| `eventId` | UUID (FK → Event) | L'événement |
| `userId` | UUID (FK → User) | Le membre |
| `role` | Enum | `CREATOR`, `INVITED`, ou `PARTICIPANT` |

**Contrainte d'unicité** : `@@unique([eventId, userId])` — un utilisateur ne peut être membre qu'une seule fois.

Le créateur est automatiquement ajouté en tant que `CREATOR` quand l'événement est créé. Les utilisateurs invités commencent en `INVITED` et deviennent `PARTICIPANT` quand ils acceptent.

### Playlist

Une playlist collaborative où les membres peuvent ajouter, supprimer et réordonner des morceaux.

| Colonne | Type | Description |
|---------|------|-------------|
| `name` | String | Nom de la playlist |
| `creatorId` | UUID (FK → User) | Qui l'a créée |
| `isPublic` | Boolean | Si elle apparaît dans le fil public |
| `licenseType` | Enum | `OPEN` ou `INVITE_ONLY` |

### PlaylistTrack

Un morceau dans une playlist, avec une position pour l'ordre.

| Colonne | Type | Description |
|---------|------|-------------|
| `playlistId` | UUID (FK → Playlist) | Quelle playlist |
| `title` | String | Titre du morceau |
| `artist` | String | Nom de l'artiste |
| `position` | Int | Ordre dans la playlist (indexé à 0) |
| `addedById` | UUID (FK → User) | Qui l'a ajouté |

Le champ `position` est géré via des transactions Prisma : quand un morceau est déplacé ou supprimé, toutes les positions affectées sont recalculées de manière atomique.

### PlaylistMember

Lie les utilisateurs aux playlists avec des permissions d'édition.

| Colonne | Type | Description |
|---------|------|-------------|
| `playlistId` | UUID (FK → Playlist) | La playlist |
| `userId` | UUID (FK → User) | Le membre |
| `canEdit` | Boolean | Si le membre peut ajouter/supprimer/réordonner des morceaux |
| `status` | String | `INVITED` ou `ACCEPTED` |

**Contrainte d'unicité** : `@@unique([playlistId, userId])` — une seule appartenance par utilisateur par playlist.

## Décisions de conception clés

1. **UUID comme clés primaires** : Tous les ID sont des UUID (`@default(uuid())`). Contrairement aux entiers auto-incrémentés, les UUID peuvent être générés côté client et ne révèlent pas combien d'enregistrements existent.

2. **voteCount dénormalisé** : Le champ `Track.voteCount` évite les requêtes `COUNT(*)` coûteuses. Il reste cohérent grâce aux transactions Prisma qui le mettent à jour lors de l'ajout/suppression de votes.

3. **Suppressions en cascade** : `onDelete: Cascade` sur Track, Vote, EventMember, PlaylistTrack et PlaylistMember garantit que la suppression d'un événement ou d'une playlist nettoie automatiquement tous les enregistrements associés.

4. **Contraintes d'unicité composites** : `@@unique([trackId, userId])` sur Vote et `@@unique([eventId, userId])` sur EventMember empêchent les doublons au niveau de la base de données, comme filet de sécurité en plus des vérifications applicatives.

5. **Pas de table de rôles séparée** : Les rôles sont de simples enums (`MemberRole`, `PlaylistLicense`) plutôt qu'une table séparée. Il n'y a que 2-3 valeurs chacun, donc une table de jointure serait du over-engineering.
