# Temps réel avec Socket.io — Music Room

## Qu'est-ce que Socket.io ?

Socket.io est une bibliothèque qui maintient une connexion permanente entre l'application mobile et le backend. Contrairement aux appels API REST (où le mobile demande et le backend répond), Socket.io permet au backend de pousser des données vers le mobile à tout moment, sans qu'on lui demande. C'est ce qui rend l'application "temps réel" : quand quelqu'un vote, tous les autres utilisateurs voient le changement instantanément.

Sous le capot, Socket.io utilise les WebSockets (un protocole qui garde la connexion ouverte). Si les WebSockets ne sont pas disponibles (rare), il repasse en HTTP long-polling.

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         BACKEND (Express + Socket.io)             │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Serveur Socket.io                          │  │
│  │                                                             │  │
│  │  ┌─────────────────┐  ┌──────────────────┐                 │  │
│  │  │  Room :          │  │  Room :            │                │  │
│  │  │  event:abc-123   │  │  playlist:def-456 │                │  │
│  │  │                  │  │                   │                │  │
│  │  │  - Socket User A │  │  - Socket User B  │                │  │
│  │  │  - Socket User B │  │  - Socket User C  │                │  │
│  │  │  - Socket User C │  │                   │                │  │
│  │  └─────────────────┘  └──────────────────┘                 │  │
│  │                                                             │  │
│  │  ┌─────────────────┐  ┌──────────────────┐                 │  │
│  │  │  Room :          │  │  Room :            │                │  │
│  │  │  user:user-A-id  │  │  user:user-B-id  │                │  │
│  │  │                  │  │                   │                │  │
│  │  │  - Socket User A │  │  - Socket User B  │                │  │
│  │  └─────────────────┘  └──────────────────┘                 │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Les contrôleurs émettent des événements après les opérations     │
│  en base de données :                                             │
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

## Comment fonctionnent les rooms

Les rooms sont le moyen de Socket.io de regrouper les connexions. Au lieu d'envoyer une mise à jour à chaque utilisateur connecté, on l'envoie uniquement aux utilisateurs dans une room spécifique.

Il y a trois types de rooms :

| Pattern de room | Objectif | Exemple |
|----------------|----------|---------|
| `event:{eventId}` | Utilisateurs consultant un événement spécifique | `event:abc-123` |
| `playlist:{playlistId}` | Utilisateurs éditant une playlist spécifique | `playlist:def-456` |
| `user:{userId}` | Notifications personnelles pour un utilisateur | `user:user-A-id` |

Un utilisateur **rejoint une room** quand il ouvre l'écran correspondant, et **la quitte** quand il navigue ailleurs.

## Référence des événements

### Événements DU mobile VERS le backend (ClientToServerEvents)

| Événement | Payload | Quand il est envoyé | Ce qu'il fait |
|-----------|---------|---------------------|---------------|
| `authenticate` | `userId: string` | À la connexion du socket | Rejoint la room `user:{userId}` pour les notifications personnelles |
| `joinEvent` | `eventId: string` | Ouverture de l'EventScreen | Rejoint la room `event:{eventId}` |
| `leaveEvent` | `eventId: string` | Quitter l'EventScreen | Quitte la room `event:{eventId}` |
| `joinPlaylist` | `playlistId: string` | Ouverture du PlaylistScreen | Rejoint la room `playlist:{playlistId}` |
| `leavePlaylist` | `playlistId: string` | Quitter le PlaylistScreen | Quitte la room `playlist:{playlistId}` |

### Événements DU backend VERS le mobile (ServerToClientEvents)

| Événement | Payload | Quand il est émis | Qui le reçoit |
|-----------|---------|-------------------|---------------|
| `trackAdded` | `{ eventId, tracks[] }` | Après l'ajout d'un morceau à un événement | Room `event:{eventId}` |
| `trackVoted` | `{ eventId, tracks[] }` | Après un vote ajouté/supprimé | Room `event:{eventId}` |
| `playlistTrackAdded` | `{ playlistId, tracks[] }` | Après l'ajout d'un morceau à une playlist | Room `playlist:{playlistId}` |
| `playlistTrackRemoved` | `{ playlistId, tracks[] }` | Après la suppression d'un morceau d'une playlist | Room `playlist:{playlistId}` |
| `playlistTrackReordered` | `{ playlistId, tracks[] }` | Après le réordonnancement d'un morceau de playlist | Room `playlist:{playlistId}` |
| `eventCreated` | `{ event }` | Après la création d'un événement public | **Tous les clients connectés** (global) |
| `eventDeleted` | `{ eventId }` | Après la suppression d'un événement | **Tous les clients connectés** (global) |
| `playlistCreated` | `{ playlist }` | Après la création d'une playlist publique | **Tous les clients connectés** (global) |
| `playlistDeleted` | `{ playlistId }` | Après la suppression d'une playlist | **Tous les clients connectés** (global) |
| `friendRequestReceived` | `{ from: { id, name, email } }` | Après l'envoi d'une demande d'ami | Room `user:{targetUserId}` |
| `invitationReceived` | `{ type, name }` | Après une invitation à un événement/playlist | Room `user:{targetUserId}` |

## Flux concret : voter sur un morceau

Voici exactement ce qui se passe quand l'utilisateur A vote sur un morceau, et l'utilisateur B voit la mise à jour :

```
User A (mobile)                Backend                    User B (mobile)
     │                            │                            │
     │ [Déjà dans la room         │  [Déjà dans la room        │
     │  event:abc-123]            │   event:abc-123]           │
     │                            │                            │
     │ POST /api/events/abc-123/  │                            │
     │   tracks/track-1/vote      │                            │
     │───────────────────────────▶│                            │
     │                            │                            │
     │                            │ 1. voteService.voteForTrack()
     │                            │    (transaction Prisma)    │
     │                            │                            │
     │                            │ 2. Récupérer la liste des  │
     │                            │    morceaux mise à jour,   │
     │                            │    triée par voteCount     │
     │                            │                            │
     │                            │ 3. io.to('event:abc-123')  │
     │                            │    .emit('trackVoted', {   │
     │                            │      eventId, tracks       │
     │                            │    })                      │
     │                            │────────────────────────────▶│
     │                            │                            │
     │ 4. Réponse HTTP :          │                            │ 5. Le socket reçoit
     │ { success, data, voted }   │                            │    'trackVoted'
     │◀───────────────────────────│                            │    → Mettre à jour
     │                            │                            │      l'UI avec la
     │ 6. Mettre à jour           │                            │      nouvelle liste
     │    sa propre UI            │                            │
```

**Fichiers clés** :
- `backend/src/controllers/event.controller.ts:159-178` — Le contrôleur `voteForTrack()` émet `trackVoted`
- `mobile/src/screens/EventScreen.tsx` — Écoute l'événement `trackVoted` et met à jour l'état de la liste de morceaux

## Implémentation côté backend

### Configuration du serveur

**Fichier** : `backend/src/config/socket.ts`

```typescript
import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';

// Événements typés pour la sécurité des types
interface ServerToClientEvents {
  trackAdded: (data: { eventId: string; tracks: unknown[] }) => void;
  trackVoted: (data: { eventId: string; tracks: unknown[] }) => void;
  // ... tous les autres événements
}

interface ClientToServerEvents {
  joinEvent: (eventId: string) => void;
  leaveEvent: (eventId: string) => void;
  // ... tous les autres événements
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

### Émission depuis les contrôleurs

Les contrôleurs importent `getIO()` et émettent après le succès de l'opération en base de données :

**Fichier** : `backend/src/controllers/event.controller.ts:105-121`

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

**Fichier** : `backend/src/controllers/playlist.controller.ts:5-10` — Fonction utilitaire pour les mises à jour de playlist :

```typescript
async function emitPlaylistUpdate(playlistId, userId, event) {
  const io = getIO();
  if (!io) return;
  const tracks = await playlistService.getPlaylistTracks(playlistId, userId);
  io.to(`playlist:${playlistId}`).emit(event, { playlistId, tracks });
}
```

## Implémentation côté mobile

### Client Socket

**Fichier** : `mobile/src/services/socket.ts`

Le mobile crée une seule connexion Socket.io vers le backend :

```typescript
const socket = io(API_URL, {
  transports: ['websocket'],  // WebSocket d'abord, pas de polling
  autoConnect: false,          // Connexion manuelle après la connexion
});

socket.on('connect', () => {
  // Rejoindre automatiquement la room utilisateur pour les notifications
  const userId = useAuthStore.getState().userId;
  if (userId) socket.emit('authenticate', userId);
});
```

### Écoute dans les écrans

Dans `EventScreen.tsx`, le composant rejoint la room de l'événement au montage et la quitte au démontage :

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

### Écouteurs de notifications

**Fichier** : `mobile/src/services/socket.ts:15-23`

Pour les notifications globales (demandes d'amis, invitations), le service socket utilise un pattern basé sur des callbacks au lieu de hooks React, car ces écouteurs doivent fonctionner sur tous les écrans :

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

Le `NotificationsScreen` et l'`AppNavigator` s'abonnent à ces écouteurs pour afficher des badges et des notifications.

## Sécurité des types

`ServerToClientEvents` et `ClientToServerEvents` sont des interfaces TypeScript. Cela signifie :
- Si le backend émet un événement avec la mauvaise structure de payload, TypeScript le détecte à la compilation
- Si le mobile écoute un événement qui n'existe pas, TypeScript le détecte
- L'autocomplétion de l'IDE affiche tous les événements disponibles et leurs payloads

Cela élimine le problème des "échecs silencieux" courant avec Socket.io, où une faute de frappe dans un nom d'événement (`trackAdded` vs `trackadded`) ferait silencieusement disparaître les messages.
