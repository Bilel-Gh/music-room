# Conception de l'API — Music Room

## Principes REST appliqués dans ce projet

REST (Representational State Transfer) est un ensemble de conventions pour concevoir des API web. Voici comment chaque principe est appliqué :

### 1. Les ressources sont des noms, pas des verbes

Chaque URL représente une "chose" (ressource), pas une action. La méthode HTTP (verbe) indique au serveur quoi en faire.

```
Bien :  POST /api/events          (créer un événement)
Mal :   POST /api/createEvent     (verbe dans l'URL)

Bien :  GET /api/users/me         (obtenir mon profil)
Mal :   GET /api/getMyProfile     (verbe dans l'URL)
```

### 2. Les méthodes HTTP ont un sens

| Méthode | Signification | Exemple |
|---------|---------------|---------|
| `GET` | Lire une ressource (sans effets de bord) | `GET /api/events` — lister les événements |
| `POST` | Créer une nouvelle ressource | `POST /api/events` — créer un événement |
| `PUT` | Mettre à jour une ressource existante | `PUT /api/events/:id` — modifier un événement |
| `DELETE` | Supprimer une ressource | `DELETE /api/events/:id` — supprimer un événement |

### 3. Sans état (Stateless)

Chaque requête contient tout ce dont le serveur a besoin pour la traiter (le token JWT dans le header). Le serveur ne stocke pas d'état de session entre les requêtes.

### 4. Format de réponse cohérent

Chaque endpoint retourne la même structure JSON :

```json
// Succès
{
  "success": true,
  "data": { ... }
}

// Erreur
{
  "success": false,
  "error": "Message d'erreur"
}

// Erreur de validation
{
  "success": false,
  "errors": [
    { "field": "email", "message": "Invalid email" }
  ]
}
```

### 5. Codes de statut HTTP significatifs

| Code | Signification | Quand il est utilisé |
|------|---------------|---------------------|
| `200` | OK | Lecture ou mise à jour réussie |
| `201` | Créé | Création réussie (POST) |
| `204` | Pas de contenu | Suppression réussie (rien à retourner) |
| `400` | Requête invalide | Erreur de validation (Zod) ou entrée malformée |
| `401` | Non authentifié | Token JWT manquant ou invalide |
| `403` | Interdit | Authentifié mais non autorisé (pas créateur, pas membre, etc.) |
| `404` | Non trouvé | La ressource n'existe pas |
| `409` | Conflit | Doublon (email déjà pris, déjà membre) |
| `429` | Trop de requêtes | Limite de débit dépassée |
| `500` | Erreur serveur interne | Erreur serveur inattendue |

### Pourquoi JSON ?

JSON (JavaScript Object Notation) est le format standard pour les API REST car :
- Il est natif en JavaScript/TypeScript (toute notre stack)
- Il est lisible par l'humain et facile à débugger
- Chaque client HTTP et framework le supporte nativement
- Il est léger comparé au XML

---

## Familles d'endpoints

### Authentification (`/api/auth`)

Gère l'inscription, la connexion, le rafraîchissement de token, la vérification email, la réinitialisation de mot de passe et Google OAuth.

| Méthode | Endpoint | Auth ? | Objectif |
|---------|----------|--------|----------|
| `POST` | `/register` | Non | Créer un compte |
| `POST` | `/login` | Non | Se connecter avec email/mot de passe |
| `POST` | `/refresh` | Non | Obtenir une nouvelle paire de tokens |
| `POST` | `/verify-email` | Non | Vérifier l'email avec un code à 6 chiffres |
| `POST` | `/forgot-password` | Non | Demander une réinitialisation de mot de passe |
| `POST` | `/reset-password` | Non | Réinitialiser le mot de passe avec un token |
| `PUT` | `/link-google` | Oui | Lier un compte Google |
| `GET` | `/google` | Non | Démarrer Google OAuth (web) |
| `GET` | `/google/callback` | Non | Callback Google OAuth (web) |
| `POST` | `/google/mobile` | Non | Google OAuth (ID token mobile) |

**Limité en débit** : `/register`, `/login`, `/forgot-password` (5 req/15min).

### Utilisateurs (`/api/users`)

Gestion du profil, système d'amis et recherche d'utilisateurs.

| Méthode | Endpoint | Auth ? | Objectif |
|---------|----------|--------|----------|
| `GET` | `/me` | Oui | Obtenir mon profil |
| `PUT` | `/me` | Oui | Modifier mon profil |
| `GET` | `/me/friends` | Oui | Lister mes amis |
| `PUT` | `/me/subscription` | Oui | Basculer le premium |
| `GET` | `/search?q=...` | Oui | Chercher des utilisateurs par nom/email |
| `GET` | `/friend-requests/pending` | Oui | Lister les demandes en attente |
| `POST` | `/friend-requests/:friendId` | Oui | Envoyer une demande d'ami |
| `PUT` | `/friend-requests/:friendId/accept` | Oui | Accepter une demande |
| `DELETE` | `/friend-requests/:friendId/reject` | Oui | Rejeter une demande |
| `DELETE` | `/friends/:friendId` | Oui | Supprimer un ami |
| `GET` | `/:id` | Oui | Voir le profil d'un utilisateur (règles de visibilité) |

### Événements (`/api/events`)

Événements de vote musical — créer, rejoindre, ajouter des morceaux, voter.

| Méthode | Endpoint | Auth ? | Objectif |
|---------|----------|--------|----------|
| `GET` | `/` | Oui | Lister les événements publics |
| `GET` | `/me` | Oui | Lister mes événements |
| `GET` | `/invitations` | Oui | Lister les invitations en attente |
| `POST` | `/` | Oui | Créer un événement |
| `GET` | `/:id` | Oui | Détails d'un événement |
| `PUT` | `/:id` | Oui | Modifier un événement (créateur uniquement) |
| `DELETE` | `/:id` | Oui | Supprimer un événement (créateur uniquement) |
| `POST` | `/:id/join` | Oui | Rejoindre un événement OPEN |
| `POST` | `/:id/accept` | Oui | Accepter une invitation |
| `DELETE` | `/:id/reject` | Oui | Rejeter une invitation |
| `POST` | `/:id/invite` | Oui | Inviter un utilisateur (créateur uniquement) |
| `GET` | `/:id/tracks` | Oui | Lister les morceaux (triés par votes) |
| `POST` | `/:id/tracks` | Oui | Ajouter un morceau |
| `POST` | `/:id/tracks/:trackId/vote` | Oui | Voter/retirer son vote sur un morceau |

### Playlists (`/api/playlists`)

Playlists collaboratives — créer, éditer, réordonner, inviter.

| Méthode | Endpoint | Auth ? | Premium ? | Objectif |
|---------|----------|--------|-----------|----------|
| `GET` | `/` | Oui | Non | Lister les playlists publiques |
| `GET` | `/me` | Oui | Non | Lister mes playlists |
| `GET` | `/invitations` | Oui | Non | Lister les invitations en attente |
| `POST` | `/` | Oui | Oui | Créer une playlist |
| `GET` | `/:id` | Oui | Non | Détails d'une playlist |
| `PUT` | `/:id` | Oui | Non | Modifier une playlist (créateur uniquement) |
| `DELETE` | `/:id` | Oui | Non | Supprimer une playlist (créateur uniquement) |
| `GET` | `/:id/tracks` | Oui | Non | Lister les morceaux (triés par position) |
| `POST` | `/:id/tracks` | Oui | Oui | Ajouter un morceau |
| `DELETE` | `/:id/tracks/:trackId` | Oui | Oui | Supprimer un morceau |
| `PUT` | `/:id/tracks/:trackId/position` | Oui | Oui | Réordonner un morceau |
| `POST` | `/:id/invite` | Oui | Non | Inviter un utilisateur |
| `POST` | `/:id/accept` | Oui | Non | Accepter une invitation |
| `DELETE` | `/:id/reject` | Oui | Non | Rejeter une invitation |

### Autres endpoints

| Méthode | Endpoint | Objectif |
|---------|----------|----------|
| `GET` | `/health` | Vérification de santé (pas d'auth) |
| `GET` | `/api/docs` | Documentation Swagger UI |
| `GET` | `/api/config/features` | Feature flags (premiumEnabled) |

---

## Documentation Swagger

L'API est entièrement documentée avec des annotations Swagger/OpenAPI. La documentation interactive est disponible à :

```
http://localhost:3001/api/docs
```

**Comment ça fonctionne** :
- Chaque fichier de routes contient des annotations Swagger au format JSDoc (`@swagger`)
- `swagger-jsdoc` extrait ces annotations et génère une spécification OpenAPI
- `swagger-ui-express` sert une page web interactive où on peut parcourir et tester les endpoints

**Fichiers** :
- `backend/src/config/swagger.ts` — Configuration Swagger
- `backend/src/routes/*.routes.ts` — Annotations Swagger sur chaque route

**Comment lire la documentation Swagger** :
1. Démarrer le backend (`make dev`)
2. Ouvrir `http://localhost:3001/api/docs` dans un navigateur
3. Chaque endpoint affiche : méthode HTTP, URL, paramètres requis, schéma du corps de requête, réponses possibles
4. Cliquer sur "Try it out" pour envoyer une requête de test directement depuis le navigateur
5. Ajouter votre token JWT dans le bouton "Authorize" pour tester les endpoints authentifiés

---

## Structure des fichiers de routes

Chaque fichier de routes suit le même pattern :

```
backend/src/routes/
├── auth.routes.ts       ← 271 lignes (routes + annotations Swagger)
├── user.routes.ts       ← 247 lignes
├── event.routes.ts      ← 377 lignes
└── playlist.routes.ts   ← 378 lignes
```

Une définition de route typique :

```typescript
/**
 * @swagger
 * /api/events:
 *   post:
 *     summary: Créer un nouvel événement
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody: ...
 *     responses:
 *       201: ...
 *       401: ...
 */
router.post('/', authenticate, validate(createEventSchema), createEvent);
```

La chaîne de middlewares est : `authenticate` (JWT) → `validate` (schéma Zod) → fonction contrôleur.
