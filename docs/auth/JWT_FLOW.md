# Flux d'authentification JWT — Music Room

## Qu'est-ce que JWT ?

JWT (JSON Web Token) est un moyen de prouver son identité sans que le serveur ait besoin de se souvenir de vous. Après la connexion, le serveur vous donne un token signé contenant votre identifiant utilisateur et votre email. À chaque requête suivante, vous renvoyez ce token, et le serveur vérifie la signature pour confirmer qu'il est légitime.

C'est comme un bracelet de concert : vous montrez votre pièce d'identité une fois à l'entrée (connexion), vous recevez un bracelet (JWT), et ensuite vous montrez juste le bracelet pour accéder partout.

## Les deux tokens

Music Room utilise deux tokens :

| Token | Durée de vie | Objectif | Secret |
|-------|-------------|----------|--------|
| **Access Token** | 15 minutes | Utilisé à chaque requête API | `JWT_SECRET` |
| **Refresh Token** | 7 jours | Utilisé pour obtenir un nouveau access token quand il expire | `JWT_REFRESH_SECRET` |

Les deux tokens contiennent le même payload : `{ userId, email }`.

Pourquoi deux tokens ? L'access token a une durée de vie courte pour la sécurité : si quelqu'un le vole, il n'a que 15 minutes. Mais on ne veut pas que les utilisateurs se reconnectent toutes les 15 minutes, donc le refresh token (stocké de manière sécurisée sur l'appareil) peut demander un nouveau access token silencieusement.

## Diagrammes de flux

### Inscription

```
Mobile                          Backend                         Base de données
  │                                │                                │
  │  POST /api/auth/register       │                                │
  │  { email, password, name }     │                                │
  │───────────────────────────────▶│                                │
  │                                │  Vérifier si l'email existe    │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│
  │                                │                                │
  │                                │  Hasher le mot de passe        │
  │                                │  (bcrypt, 10 tours)            │
  │                                │                                │
  │                                │  Générer un code de            │
  │                                │  vérification à 6 chiffres     │
  │                                │  (expiration 15min)            │
  │                                │                                │
  │                                │  Créer l'utilisateur en BDD    │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│
  │                                │                                │
  │                                │  Générer access token (15m)    │
  │                                │  Générer refresh token (7j)    │
  │                                │                                │
  │  { user, accessToken,          │                                │
  │    refreshToken }              │                                │
  │◀───────────────────────────────│                                │
  │                                │                                │
  │  Stocker les tokens dans       │                                │
  │  AsyncStorage                  │                                │
  │  Naviguer vers la vérification │                                │
  │  email                         │                                │
```

**Fichiers impliqués** :
- `backend/src/routes/auth.routes.ts` — Définition de la route avec validation Zod
- `backend/src/controllers/auth.controller.ts` — Fonction `register()`
- `backend/src/services/auth.service.ts:26-56` — Logique d'inscription (hash, création, tokens)
- `backend/src/schemas/auth.schema.ts` — `registerSchema` (email, mot de passe >=8 car., nom >=2 car.)

### Connexion

```
Mobile                          Backend                         Base de données
  │                                │                                │
  │  POST /api/auth/login          │                                │
  │  { email, password }           │                                │
  │───────────────────────────────▶│                                │
  │                                │  Chercher l'utilisateur        │
  │                                │  par email                     │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│
  │                                │                                │
  │                                │  bcrypt.compare(password,      │
  │                                │                  user.password)│
  │                                │                                │
  │                                │  Si invalide → 401             │
  │                                │  Si valide → générer tokens    │
  │                                │                                │
  │  { user, accessToken,          │                                │
  │    refreshToken }              │                                │
  │◀───────────────────────────────│                                │
  │                                │                                │
  │  Stocker les tokens dans       │                                │
  │  AsyncStorage                  │                                │
  │  Parser le userId du payload   │                                │
  │  JWT                           │                                │
  │  Naviguer vers l'accueil       │                                │
```

**Fichiers impliqués** :
- `backend/src/services/auth.service.ts:58-75` — Fonction `login()`
- `mobile/src/store/authStore.ts` — `setTokens()` stocke dans AsyncStorage et parse le JWT

### Requête authentifiée (chaque appel API)

```
Mobile                          Backend
  │                                │
  │  GET /api/events               │
  │  Authorization: Bearer <token> │
  │  X-Platform: ios               │
  │  X-Device: iPhone 15           │
  │  X-App-Version: 1.0.0          │
  │───────────────────────────────▶│
  │                                │
  │                      ┌─────────┴─────────┐
  │                      │ auth.middleware.ts │
  │                      │                   │
  │                      │ 1. Extraire le    │
  │                      │    token du header│
  │                      │                   │
  │                      │ 2. jwt.verify()   │
  │                      │    avec JWT_SECRET│
  │                      │                   │
  │                      │ 3. Attacher le    │
  │                      │    payload à      │
  │                      │    req.user       │
  │                      │    { userId,      │
  │                      │      email }      │
  │                      │                   │
  │                      │ Si invalide :     │
  │                      │ → réponse 401     │
  │                      └─────────┬─────────┘
  │                                │
  │                                │  Continue vers le contrôleur...
  │                                │  req.user.userId est disponible
```

**Fichier** : `backend/src/middleware/auth.middleware.ts` — 22 lignes, vérifie `Authorization: Bearer <token>`, vérifie la signature, attache `{ userId, email }` à `req.user`.

### Rafraîchissement du token (quand l'access token expire)

```
Mobile                          Backend                         Base de données
  │                                │                                │
  │  Un appel API échoue avec 401  │                                │
  │  (access token expiré)         │                                │
  │                                │                                │
  │  L'intercepteur Axios capture  │                                │
  │  le 401                        │                                │
  │                                │                                │
  │  POST /api/auth/refresh        │                                │
  │  { refreshToken }              │                                │
  │───────────────────────────────▶│                                │
  │                                │  jwt.verify(refreshToken,      │
  │                                │           JWT_REFRESH_SECRET)  │
  │                                │                                │
  │                                │  Si invalide → 401             │
  │                                │                                │
  │                                │  Trouver l'utilisateur par     │
  │                                │  payload.userId                │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│
  │                                │                                │
  │                                │  Générer une nouvelle paire    │
  │                                │  de tokens                     │
  │                                │                                │
  │  { accessToken, refreshToken } │                                │
  │◀───────────────────────────────│                                │
  │                                │                                │
  │  Mettre à jour les tokens      │                                │
  │  stockés                       │                                │
  │  Retenter la requête originale │                                │
  │  avec le nouveau access token  │                                │
```

**Fichiers impliqués** :
- `mobile/src/services/api.ts:29-57` — L'intercepteur de réponse Axios capture le 401, appelle refresh, retente
- `backend/src/services/auth.service.ts:77-93` — `refreshToken()` vérifie l'ancien refresh token, génère une nouvelle paire

### Vérification email

```
Mobile                          Backend                         Base de données
  │                                │                                │
  │  POST /api/auth/verify-email   │                                │
  │  { email, code: "123456" }     │                                │
  │───────────────────────────────▶│                                │
  │                                │  Trouver l'utilisateur         │
  │                                │  par email                     │
  │                                │───────────────────────────────▶│
  │                                │◀───────────────────────────────│
  │                                │                                │
  │                                │  Vérifier : le code             │
  │                                │  correspond ?                   │
  │                                │  Vérifier : pas expiré         │
  │                                │  (15min) ?                     │
  │                                │                                │
  │                                │  Mettre à jour l'utilisateur : │
  │                                │  emailVerified = true          │
  │                                │  verificationCode = null       │
  │                                │───────────────────────────────▶│
  │                                │                                │
  │  { message: "Email vérifié" }  │                                │
  │◀───────────────────────────────│                                │
```

**Fichier** : `backend/src/services/auth.service.ts:95-123` — Fonction `verifyEmail()`.

Note : En développement, le code de vérification est affiché dans la console (`console.log`) au lieu d'être envoyé par email. C'est intentionnel — le service d'envoi d'email serait une dépendance de production.

### Réinitialisation du mot de passe

```
1. POST /api/auth/forgot-password { email }
   → Génère un token hexadécimal aléatoire de 32 octets (expiration 30min)
   → Log le token en console (pas d'email envoyé en dev)
   → Retourne toujours le même message (ne révèle pas si l'email existe)

2. POST /api/auth/reset-password { token, password }
   → Trouve l'utilisateur avec le token correspondant non expiré
   → Hashe le nouveau mot de passe avec bcrypt
   → Efface le token de réinitialisation de la base de données
```

**Fichier** : `backend/src/services/auth.service.ts:125-167` — `forgotPassword()` et `resetPassword()`.

## Structure du token

Les deux tokens sont des JWT standards avec trois parties : `header.payload.signature`

**Payload** :
```json
{
  "userId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "email": "user@example.com",
  "iat": 1709312400,
  "exp": 1709313300
}
```

- `iat` (issued at) : quand le token a été créé
- `exp` (expiration) : quand il devient invalide (15 min pour l'access, 7 jours pour le refresh)

La signature est créée avec HMAC-SHA256 et la clé secrète. Si quelqu'un modifie le payload, la signature ne correspondra plus, et `jwt.verify()` le rejettera.

## Stockage des tokens sur mobile

Les tokens sont stockés dans **AsyncStorage** (le stockage clé-valeur local de React Native) :

```
asyncStorage:
  auth_access_token  → "eyJhbGciOiJIUzI1..."
  auth_refresh_token → "eyJhbGciOiJIUzI1..."
```

Au démarrage de l'application, `authStore.loadTokens()` lit ces valeurs depuis AsyncStorage et restaure la session sans nécessiter une nouvelle connexion.

**Fichier** : `mobile/src/store/authStore.ts` — Store Zustand avec `setTokens()`, `logout()` et `loadTokens()`.

## Considérations de sécurité

- **Access token en mémoire + AsyncStorage** : Le store Zustand garde le token actuel en mémoire pour un accès rapide, et le persiste dans AsyncStorage pour la restauration de session
- **Pas de token dans l'URL** : Les tokens sont toujours dans le header `Authorization`, jamais dans les paramètres de requête
- **Rotation du refresh token** : Chaque rafraîchissement génère une paire de tokens complètement nouvelle
- **Séparation des secrets** : Les tokens d'accès et de rafraîchissement utilisent des secrets différents (`JWT_SECRET` vs `JWT_REFRESH_SECRET`)
