# Phase 1 — Système d'authentification

## Ce qu'on a construit

Un système complet d'authentification :
- Inscription / connexion classique (email + mot de passe)
- Connexion via Google (OAuth)
- Vérification d'email par code à 6 chiffres
- Mot de passe oublié / réinitialisation
- Tokens JWT qui se renouvellent automatiquement

---

## Comment ça marche (vue d'ensemble)

```
Client (mobile/web)                     Serveur (Express)
       |                                       |
       |  POST /api/auth/register              |
       |  { email, password, name }            |
       | ------------------------------------> |
       |                                       |  → Valide les données (Zod)
       |                                       |  → Hash le mot de passe (bcrypt)
       |                                       |  → Crée l'utilisateur en BDD (Prisma)
       |                                       |  → Génère un code de vérification
       |                                       |  → Génère 2 tokens JWT
       | <------------------------------------ |
       |  { user, accessToken, refreshToken }  |
       |                                       |
       |  GET /api/protected-route             |
       |  Header: Authorization: Bearer <token>|
       | ------------------------------------> |
       |                                       |  → Vérifie le token JWT
       |                                       |  → Attache l'utilisateur à la requête
       |                                       |  → Exécute la route protégée
       | <------------------------------------ |
       |  { données protégées }                |
```

---

## Toutes les routes

### 1. `POST /api/auth/register` — Inscription

**Ce qu'on envoie :**
```json
{
  "email": "jean@example.com",
  "password": "monmotdepasse",
  "name": "Jean Dupont"
}
```

**Ce qui se passe côté serveur :**
1. Zod vérifie que l'email est valide, le mot de passe fait au moins 8 caractères, et le nom au moins 2
2. On vérifie que l'email n'existe pas déjà en base (sinon erreur 409)
3. Le mot de passe est hashé avec bcrypt (on ne stocke jamais le mot de passe en clair)
4. Un code de vérification à 6 chiffres est généré et stocké en base (valable 15 min)
5. Le code est affiché dans la console du serveur (pas d'envoi d'email pour l'instant)
6. L'utilisateur est créé dans PostgreSQL via Prisma
7. Deux tokens JWT sont générés et renvoyés

**Ce qu'on reçoit :**
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid...", "email": "jean@example.com", "name": "Jean Dupont" },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
}
```

### 2. `POST /api/auth/login` — Connexion

**Ce qu'on envoie :**
```json
{
  "email": "jean@example.com",
  "password": "monmotdepasse"
}
```

**Ce qui se passe :**
1. On cherche l'utilisateur par email
2. On compare le mot de passe envoyé avec le hash stocké en BDD (via `bcrypt.compare`)
3. Si ça matche, on génère une nouvelle paire de tokens

**Erreurs possibles :** 401 si l'email n'existe pas ou si le mot de passe est faux (même message dans les deux cas pour ne pas révéler si un email existe ou non).

### 3. `POST /api/auth/refresh` — Renouveler les tokens

**Ce qu'on envoie :**
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Pourquoi cette route existe :** L'access token expire au bout de 15 minutes. Plutôt que de redemander le mot de passe, le client utilise le refresh token (valide 7 jours) pour obtenir une nouvelle paire de tokens sans intervention de l'utilisateur.

### 4. `POST /api/auth/verify-email` — Vérifier son email

**Ce qu'on envoie :**
```json
{
  "email": "jean@example.com",
  "code": "482917"
}
```

**Ce qui se passe :**
1. On cherche l'utilisateur par email
2. On compare le code envoyé avec celui stocké en base
3. On vérifie que le code n'est pas expiré (15 minutes de validité)
4. Si tout est bon, on passe `emailVerified` à `true` et on efface le code

**Pour l'instant**, le code est simplement affiché dans les logs du serveur (`console.log`). En production, on enverrait un vrai email.

### 5. `POST /api/auth/forgot-password` — Demander un lien de réinitialisation

**Ce qu'on envoie :**
```json
{
  "email": "jean@example.com"
}
```

**Ce qui se passe :**
1. On génère un token aléatoire (32 octets en hexadécimal, via `crypto.randomBytes`)
2. On le stocke dans le champ `resetToken` de l'utilisateur, avec une expiration de 30 minutes
3. Le token est affiché dans la console du serveur

**Point sécurité :** La réponse est toujours la même que l'email existe ou non. On ne veut pas qu'un attaquant puisse deviner quels emails sont inscrits.

### 6. `POST /api/auth/reset-password` — Réinitialiser le mot de passe

**Ce qu'on envoie :**
```json
{
  "token": "4c546eea79967450cbb6...",
  "password": "nouveaumotdepasse"
}
```

**Ce qui se passe :**
1. On cherche un utilisateur qui a ce `resetToken` et dont l'expiration n'est pas dépassée
2. Si trouvé, on hash le nouveau mot de passe et on met à jour
3. On efface le token de réinitialisation pour qu'il ne puisse pas être réutilisé

### 7. `GET /api/auth/google` — Connexion via Google

Redirige l'utilisateur vers la page de connexion Google. Google demande l'autorisation d'accéder au profil et à l'email.

### 8. `GET /api/auth/google/callback` — Retour de Google

**Ce qui se passe après que l'utilisateur a accepté sur Google :**
1. Passport.js reçoit le profil Google (nom, email, googleId)
2. On cherche si un utilisateur existe déjà avec ce `googleId` ou cet `email`
3. Si oui : on le connecte. Si l'email existe sans Google lié, on lie automatiquement le compte Google
4. Si non : on crée un nouveau compte (sans mot de passe, `emailVerified: true`)
5. On redirige vers le client avec les tokens dans l'URL

### 9. `PUT /api/auth/link-google` — Lier un compte Google (route protégée)

**Nécessite un token d'accès** dans le header `Authorization: Bearer <token>`

**Ce qu'on envoie :**
```json
{
  "googleId": "google-123456"
}
```

**Ce qui se passe :**
1. Le middleware d'authentification vérifie le JWT et identifie l'utilisateur
2. On vérifie que ce `googleId` n'est pas déjà lié à un autre compte
3. On ajoute le `googleId` à l'utilisateur courant

---

## Les concepts clés expliqués

### JWT (JSON Web Token)

Un JWT c'est une chaîne de caractères signée qui contient des informations. On en utilise deux :

- **Access token** (15 min) : envoyé à chaque requête protégée dans le header `Authorization`. Court car si quelqu'un le vole, il ne fonctionne pas longtemps.
- **Refresh token** (7 jours) : utilisé uniquement pour obtenir un nouvel access token. Plus long car il est stocké de façon sécurisée côté client.

Le serveur signe les tokens avec un secret (`JWT_SECRET`). Quand il reçoit un token, il vérifie la signature — si quelqu'un modifie le contenu, la signature ne correspond plus et le token est rejeté.

### Bcrypt (hashage de mot de passe)

On ne stocke jamais `"monmotdepasse"` en base. On stocke un hash, par exemple `"$2b$10$N9qo8uLOickgx2ZMRZoMye..."`. C'est irréversible : on ne peut pas retrouver le mot de passe à partir du hash. Pour vérifier un mot de passe, bcrypt re-hash la tentative et compare les deux résultats.

Le `10` dans le hash correspond au "salt rounds" — le nombre de fois que l'algorithme est appliqué. Plus c'est élevé, plus c'est lent (et donc sécurisé contre les attaques par force brute).

### Zod (validation)

Zod vérifie la forme des données avant qu'elles n'atteignent la logique métier. Si un champ est manquant ou mal formaté, la requête est rejetée avec une erreur 400 avant même qu'on touche à la base de données.

```typescript
// Exemple : le schéma de register
const registerSchema = z.object({
  email: z.email(),                     // doit être un email valide
  password: z.string().min(8),          // minimum 8 caractères
  name: z.string().min(2),              // minimum 2 caractères
});
```

### Prisma (ORM)

Prisma fait le lien entre notre code TypeScript et la base PostgreSQL. Au lieu d'écrire du SQL brut, on écrit :

```typescript
// Créer un utilisateur
const user = await prisma.user.create({
  data: { email, password: hashedPassword, name }
});

// Chercher par email
const user = await prisma.user.findUnique({ where: { email } });
```

Le schéma Prisma (`schema.prisma`) définit la structure des tables. Quand on le modifie, on lance une migration (`prisma migrate dev`) qui met à jour la base de données.

### Passport.js (OAuth Google)

Passport est un middleware d'authentification pour Express. On utilise la "stratégie" Google OAuth 2.0 :

1. L'utilisateur clique sur "Se connecter avec Google"
2. Il est redirigé vers Google qui lui demande d'autoriser l'accès
3. Google renvoie un profil (nom, email, ID unique) à notre serveur
4. Notre serveur crée ou retrouve l'utilisateur et génère des tokens

La configuration est dans `src/config/passport.ts`. La stratégie ne s'active que si `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET` sont renseignés dans le `.env`.

---

## Organisation des fichiers

```
backend/src/
├── index.ts                          ← Point d'entrée : lance le serveur
├── app.ts                            ← Configure Express (middlewares + routes)
│
├── config/
│   └── passport.ts                   ← Configuration Google OAuth avec Passport.js
│
├── routes/
│   └── auth.routes.ts                ← Déclare tous les endpoints d'authentification
│
├── controllers/
│   └── auth.controller.ts            ← Reçoit la requête, appelle le service, renvoie la réponse
│
├── services/
│   └── auth.service.ts               ← Logique métier (hash, vérif, tokens, reset)
│
├── middleware/
│   ├── validate.middleware.ts         ← Valide req.body avec un schéma Zod
│   ├── auth.middleware.ts             ← Vérifie le JWT, protège les routes
│   └── error.middleware.ts            ← Attrape toutes les erreurs, renvoie du JSON propre
│
├── schemas/
│   └── auth.schema.ts                ← Schémas Zod pour chaque route
│
├── lib/
│   └── prisma.ts                     ← Instance unique du client Prisma
│
├── types/
│   └── express.d.ts                  ← Ajoute le champ "user" au type Request d'Express
│
└── tests/
    ├── setup.ts                      ← Charge les variables d'environnement pour les tests
    └── auth.test.ts                  ← 16 tests d'intégration
```

### Le flux d'une requête

```
Requête HTTP
    ↓
app.ts (cors, helmet, json, passport)
    ↓
auth.routes.ts → quel endpoint ?
    ↓
validate.middleware.ts → les données sont valides ?
    ↓                         ↓ NON
    ↓ OUI                    Erreur 400
    ↓
auth.controller.ts → appelle le service
    ↓
auth.service.ts → logique métier (bcrypt, jwt, prisma, crypto)
    ↓
    ↓ Erreur ?  →  error.middleware.ts  →  Réponse JSON avec le bon code HTTP
    ↓
Réponse JSON { success: true, data: ... }
```

---

## Le modèle User en base de données

| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant unique, généré automatiquement |
| `email` | String (unique) | Adresse email, sert d'identifiant de connexion |
| `password` | String (nullable) | Hash bcrypt. Null si l'utilisateur s'est inscrit via Google |
| `name` | String | Nom affiché |
| `googleId` | String (nullable, unique) | ID Google pour l'OAuth |
| `emailVerified` | Boolean | L'email a-t-il été vérifié ? (par défaut : false) |
| `isAdmin` | Boolean | L'utilisateur est-il admin ? (par défaut : false) |
| `verificationCode` | String (nullable) | Code à 6 chiffres pour vérifier l'email |
| `verificationCodeExpiry` | DateTime (nullable) | Date d'expiration du code (15 min) |
| `resetToken` | String (nullable) | Token pour réinitialiser le mot de passe |
| `resetTokenExpiry` | DateTime (nullable) | Date d'expiration du token de reset (30 min) |
| `createdAt` | DateTime | Date de création du compte |
| `updatedAt` | DateTime | Dernière modification (mis à jour automatiquement) |

---

## Les tests

16 tests d'intégration qui tapent sur l'API comme le ferait un vrai client :

| Test | Ce qu'il vérifie |
|------|------------------|
| Register — succès | Créer un compte renvoie 201 avec un user et des tokens |
| Register — doublon | Réinscrire le même email renvoie 409 |
| Register — données invalides | Email ou mot de passe mal formaté renvoie 400 |
| Login — succès | Bons identifiants renvoient 200 avec des tokens |
| Login — mauvais mot de passe | Renvoie 401 |
| Login — email inconnu | Renvoie 401 |
| Refresh — succès | Un refresh token valide renvoie de nouveaux tokens |
| Refresh — token invalide | Un faux token renvoie 401 |
| Verify email — code correct | Le bon code passe `emailVerified` à true |
| Verify email — mauvais code | Un code faux renvoie 400 |
| Forgot password — succès | Accepte la demande et génère un token de reset |
| Reset password — token valide | Met à jour le mot de passe |
| Reset password — login après | On peut se connecter avec le nouveau mot de passe |
| Reset password — token invalide | Un faux token renvoie 400 |
| Link Google — sans auth | Renvoie 401 sans token d'accès |
| Link Google — avec auth | Lie le googleId au compte authentifié |

---

## Codes HTTP utilisés

| Code | Signification | Quand |
|------|--------------|-------|
| 200 | OK | Login, refresh, vérification email, reset password |
| 201 | Créé | Inscription réussie |
| 400 | Mauvaise requête | Données invalides, code expiré, token de reset invalide |
| 401 | Non autorisé | Mauvais identifiants, JWT expiré/invalide |
| 404 | Non trouvé | Utilisateur introuvable (verify-email) |
| 409 | Conflit | Email déjà utilisé, Google déjà lié à un autre compte |
| 500 | Erreur serveur | Bug inattendu (le message réel est masqué) |

---

## Variables d'environnement nécessaires

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | URL de connexion PostgreSQL (pooler Supabase, port 6543) |
| `DIRECT_URL` | URL directe PostgreSQL (pour les migrations, port 5432) |
| `JWT_SECRET` | Clé secrète pour signer les access tokens |
| `JWT_REFRESH_SECRET` | Clé secrète pour signer les refresh tokens |
| `GOOGLE_CLIENT_ID` | ID de l'application Google (console.cloud.google.com) |
| `GOOGLE_CLIENT_SECRET` | Secret de l'application Google |
| `CLIENT_URL` | URL du client pour la redirection après OAuth (ex: `http://localhost:3000`) |

---

## Phase 1 terminée

Tout le système d'authentification est en place :
- [x] Inscription / connexion classique
- [x] Tokens JWT (access + refresh)
- [x] Google OAuth avec Passport.js
- [x] Lier un compte Google à un compte existant
- [x] Vérification d'email par code à 6 chiffres
- [x] Mot de passe oublié + réinitialisation
- [x] 16 tests d'intégration qui passent
