# Vue d'ensemble de l'architecture — Music Room

## Qu'est-ce que Music Room ?

Music Room est une application musicale collaborative où les utilisateurs peuvent créer des événements pour voter sur des morceaux ensemble, ou construire des playlists partagées avec des amis. Tout se passe en temps réel : quand quelqu'un vote ou ajoute un morceau, tous les autres participants voient le changement instantanément.

L'application est composée de trois parties principales qui communiquent entre elles :

```
┌─────────────────────────────────────────────────────────────────┐
│                        APPLICATION MOBILE                        │
│              React Native (Expo) + TypeScript                   │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Écrans   │  │  Zustand  │  │  Client  │  │  Client      │   │
│  │  (UI)     │  │  (État)   │  │  API     │  │  Socket.io   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │             │                │            │
└───────┼──────────────┼─────────────┼────────────────┼────────────┘
        │              │             │                │
        │              │     HTTPS (REST)      WebSocket (WS)
        │              │             │                │
┌───────┼──────────────┼─────────────┼────────────────┼────────────┐
│       │              │             │                │            │
│  ┌────▼─────────────────────────────────────────────▼───────┐   │
│  │                    SERVEUR EXPRESS                          │   │
│  │                                                           │   │
│  │  ┌─────────┐  ┌────────────┐  ┌───────────┐             │   │
│  │  │ Routes  │─▶│ Contrôleurs│─▶│ Services  │             │   │
│  │  └─────────┘  └────────────┘  └─────┬─────┘             │   │
│  │                                      │                    │   │
│  │  ┌──────────────────┐  ┌─────────────▼──────────────┐    │   │
│  │  │   Middlewares     │  │        Socket.io           │    │   │
│  │  │ (auth, validation,│  │  (rooms, broadcasts,       │    │   │
│  │  │  rate-limit, log) │  │   événements temps réel)   │    │   │
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
                    │    Base de données         │
                    │    PostgreSQL              │
                    │    (hébergée sur Supabase) │
                    │                           │
                    └───────────────────────────┘
```

## Comment les parties fonctionnent ensemble

### 1. Application mobile → Backend (API REST)

L'application mobile utilise **Axios** pour envoyer des requêtes HTTP au backend. Chaque requête inclut :
- Un token JWT dans le header `Authorization` (pour l'authentification)
- Des métadonnées de l'appareil (`X-Platform`, `X-Device`, `X-App-Version`) pour le logging

L'API suit les conventions REST : `GET` pour lire, `POST` pour créer, `PUT` pour modifier, `DELETE` pour supprimer. Toutes les réponses suivent la même structure : `{ success: true, data: ... }` ou `{ success: false, error: "..." }`.

**Fichier clé** : `mobile/src/services/api.ts` — Instance Axios avec intercepteurs pour le JWT et les métadonnées de l'appareil.

### 2. Application mobile ↔ Backend (WebSocket)

Pour les fonctionnalités temps réel, l'application mobile ouvre une connexion WebSocket permanente via **Socket.io**. Cette connexion reste ouverte tant que l'application est active. Quand quelque chose se produit (un vote, un morceau ajouté, une demande d'ami), le backend pousse les mises à jour par ce canal sans que l'application ait besoin de demander.

Socket.io utilise des **rooms** pour envoyer les mises à jour uniquement aux personnes concernées :
- `event:{eventId}` — les personnes qui consultent un événement spécifique
- `playlist:{playlistId}` — les personnes qui éditent une playlist spécifique
- `user:{userId}` — les notifications personnelles (demandes d'amis, invitations)

**Fichiers clés** : `backend/src/config/socket.ts` (serveur), `mobile/src/services/socket.ts` (client).

### 3. Backend → Base de données (Prisma)

Le backend ne communique jamais directement avec PostgreSQL. Il passe par **Prisma**, un ORM qui fournit des requêtes typées en TypeScript. Prisma génère des types à partir du schéma de la base de données, donc si une table a une colonne `name` de type `String`, TypeScript le sait à la compilation.

La base de données est hébergée sur **Supabase**, mais on utilise Supabase uniquement comme hébergeur PostgreSQL. Pas de SDK Supabase, pas de Supabase Auth — juste une chaîne de connexion brute à la base de données.

**Fichiers clés** : `backend/prisma/schema.prisma` (définition du schéma), `backend/src/lib/prisma.ts` (singleton du client).

## Cycle de vie d'une requête

Voici ce qui se passe quand un utilisateur vote sur un morceau dans un événement :

```
1. L'utilisateur appuie sur "Voter" sur le mobile
        │
2. Axios envoie POST /api/events/:id/tracks/:trackId/vote
   avec le token JWT + les données de localisation
        │
3. Express reçoit la requête
   → helmet ajoute les headers de sécurité
   → cors vérifie l'origine
   → globalLimiter vérifie le rate limit
   → le middleware auth vérifie le JWT
   → le middleware validate vérifie le schéma Zod
   → requestLogger enregistre l'action
        │
4. event.controller.ts traite la requête
   → appelle voteService.voteForTrack()
        │
5. vote.service.ts exécute une TRANSACTION Prisma :
   → vérifie si l'utilisateur a déjà voté (toggle)
   → crée/supprime le vote + met à jour le voteCount
   → le tout en une seule opération atomique
        │
6. Le contrôleur récupère les données mises à jour
   → répond en JSON au mobile
   → AUSSI : récupère la liste des morceaux mise à jour
   → émet 'trackVoted' via Socket.io
     vers la room event:{eventId}
        │
7. Tous les autres utilisateurs dans l'écran de l'événement
   reçoivent la liste des morceaux mise à jour
   via leur connexion WebSocket
   → leur interface se met à jour automatiquement
```

## Structure du projet (simplifiée)

```
music-room/
├── backend/
│   └── src/
│       ├── config/         ← Socket.io, Passport, rate-limit, logger, Swagger
│       ├── middleware/      ← auth, erreur, validation, logger, premium
│       ├── routes/          ← auth, user, event, playlist (+ annotations Swagger)
│       ├── controllers/     ← gestionnaires de requêtes (appellent les services, émettent les événements socket)
│       ├── services/        ← logique métier (requêtes Prisma, validations)
│       ├── schemas/         ← schémas de validation Zod
│       └── tests/           ← vitest + supertest
├── mobile/
│   └── src/
│       ├── screens/         ← tous les écrans de l'app (Login, Home, Event, Playlist...)
│       ├── navigation/      ← configuration React Navigation (tabs + stacks)
│       ├── services/        ← client API (Axios) + client Socket.io
│       ├── store/           ← stores Zustand (auth, état réseau)
│       └── components/      ← composants partagés (OfflineBanner)
├── prisma/
│   └── schema.prisma        ← schéma de la base (source de vérité unique)
└── Makefile                  ← commandes dev, build, test, migrate
```

## Les deux services principaux

### Service 1 : Vote de morceaux (Événements)

Les utilisateurs créent des "événements" où les participants peuvent ajouter des morceaux et voter pour leurs favoris. Les morceaux sont triés par nombre de votes en temps réel. Les événements ont trois types de licence :
- **OPEN** : n'importe qui peut rejoindre et voter
- **INVITE_ONLY** : seuls les membres invités peuvent participer
- **LOCATION_TIME** : il faut être dans un rayon de 5 km de l'événement ET pendant la fenêtre temporelle

### Service 2 : Éditeur de playlists (Playlists)

Les utilisateurs créent des playlists collaboratives où les membres peuvent ajouter, supprimer et réordonner des morceaux. Chaque membre peut avoir des droits d'édition ou un accès en lecture seule. Comme les événements, les playlists peuvent être OPEN (tout le monde édite) ou INVITE_ONLY (seuls les membres avec `canEdit = true`).

Les deux services utilisent des **transactions Prisma** pour les opérations qui pourraient entrer en conflit (votes simultanés, réordonnancement concurrent) et **Socket.io** pour pousser les mises à jour en temps réel.
