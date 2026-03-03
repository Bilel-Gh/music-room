# Sécurité — Music Room

Ce document liste toutes les mesures de sécurité implémentées dans le projet, ce contre quoi elles protègent, et où elles se trouvent dans le code.

## Vue d'ensemble des mesures de sécurité

```
Requête client
     │
     ▼
┌─────────────┐
│   helmet     │  ← Headers de sécurité HTTP (XSS, clickjacking, MIME sniffing)
├─────────────┤
│   cors       │  ← Contrôle d'accès cross-origin
├─────────────┤
│ rate-limit   │  ← Protection contre le brute-force (global + spécifique auth)
├─────────────┤
│   JWT auth   │  ← Vérification d'identité à chaque requête
├─────────────┤
│ Zod validate │  ← Validation des entrées (type, format, longueur)
├─────────────┤
│  contrôleur  │  ← Contrôle d'accès (propriété, appartenance, permissions)
├─────────────┤
│   Prisma     │  ← Requêtes paramétrées (prévention injection SQL)
├─────────────┤
│  bcrypt      │  ← Hashage des mots de passe (résistant au brute-force)
├─────────────┤
│  winston     │  ← Journalisation des actions (piste d'audit)
└─────────────┘
```

---

## 1. Helmet — Headers de sécurité HTTP

**Ce que c'est** : Un middleware qui définit des headers de réponse HTTP pour prévenir les attaques web courantes.

**Ce contre quoi ça protège** :
- **XSS (Cross-Site Scripting)** : Le header `Content-Security-Policy` restreint quels scripts peuvent s'exécuter
- **Clickjacking** : `X-Frame-Options` empêche l'application d'être intégrée dans des iframes
- **MIME sniffing** : `X-Content-Type-Options: nosniff` empêche les navigateurs d'interpréter les fichiers comme un type MIME différent
- **Rétrogradation de protocole** : `Strict-Transport-Security` (HSTS) force l'utilisation du HTTPS

**Où** : `backend/src/app.ts:19`
```typescript
app.use(helmet());
```

Une ligne, 11 headers de sécurité. Helmet utilise des valeurs par défaut sensées — aucune configuration nécessaire pour notre cas.

---

## 2. CORS — Cross-Origin Resource Sharing

**Ce que c'est** : Contrôle quels domaines peuvent faire des requêtes à notre API.

**Ce contre quoi ça protège** : Empêche des sites web non autorisés de faire des appels API au nom d'un utilisateur (attaques cross-origin).

**Où** : `backend/src/app.ts:18`
```typescript
app.use(cors());
```

Actuellement configuré pour autoriser toutes les origines (`*`) puisque l'application mobile et les outils de développement ont besoin d'accès. En production, cela devrait être restreint à des domaines spécifiques.

---

## 3. Limitation de débit (Rate Limiting)

**Ce que c'est** : Limite le nombre de requêtes qu'une seule adresse IP peut faire dans une fenêtre de temps.

**Ce contre quoi ça protège** : Attaques par brute-force sur login/inscription, et abus de l'API.

**Où** : `backend/src/config/rate-limit.ts`

### Deux niveaux de limitation de débit :

| Limiteur | Portée | Limite | Fenêtre | Appliqué à |
|----------|--------|--------|---------|-----------|
| `globalLimiter` | Toutes les routes | 200 requêtes | 15 minutes | `backend/src/app.ts:20` |
| `authLimiter` | Routes auth uniquement | 5 requêtes | 15 minutes | `backend/src/routes/auth.routes.ts` (sur login, register, forgot-password) |

**Exemple d'attaque prévenue** : Un attaquant essayant de deviner des mots de passe ne peut tenter que 5 connexions toutes les 15 minutes par IP. Après ça, il reçoit une réponse 429 :
```json
{ "success": false, "error": "Too many requests, please try again later" }
```

Les deux limiteurs sont désactivés pendant les tests (`NODE_ENV=test`) pour éviter des résultats de tests instables.

---

## 4. Authentification JWT

**Ce que c'est** : Les JSON Web Tokens vérifient l'identité de l'utilisateur à chaque requête API.

**Ce contre quoi ça protège** : Accès non autorisé aux ressources protégées.

**Où** : `backend/src/middleware/auth.middleware.ts`

```typescript
export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing or invalid token' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;  // { userId, email }
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}
```

**Détails de sécurité** :
- Les access tokens expirent après **15 minutes** (durée courte pour minimiser les dégâts en cas de vol)
- Les refresh tokens expirent après **7 jours**
- Deux secrets séparés : `JWT_SECRET` et `JWT_REFRESH_SECRET`
- Le token est toujours dans le header `Authorization`, jamais dans les paramètres d'URL (empêche la fuite dans les logs)

Voir `docs/auth/JWT_FLOW.md` pour le flux d'authentification complet.

---

## 5. Hashage des mots de passe (bcrypt)

**Ce que c'est** : Les mots de passe sont hashés avec bcrypt avant stockage. Le mot de passe original n'est jamais stocké ni récupérable.

**Ce contre quoi ça protège** : Même si la base de données fuite, les attaquants ne peuvent pas retrouver les mots de passe.

**Où** : `backend/src/services/auth.service.ts:32` (inscription) et `auth.service.ts:64` (connexion)

```typescript
// Inscription : hasher le mot de passe
const hashedPassword = await bcrypt.hash(data.password, 10);

// Connexion : comparer le mot de passe soumis avec le hash
const valid = await bcrypt.compare(password, user.password);
```

**Pourquoi bcrypt avec 10 tours** : Chaque tour double le temps de calcul. 10 tours signifie ~100ms par hash — assez rapide pour les utilisateurs, assez lent pour rendre le brute-force impraticable. Un attaquant essayant de craquer un hash bcrypt aurait besoin de ~100ms par tentative, rendant les attaques par dictionnaire extrêmement lentes.

---

## 6. Validation des entrées (Zod)

**Ce que c'est** : Chaque entrée API est validée par un schéma Zod avant d'atteindre le contrôleur. Les requêtes invalides sont rejetées avec une erreur 400.

**Ce contre quoi ça protège** :
- **Injection SQL** : Aucune chaîne brute n'atteint la base de données (Prisma paramétrise + Zod valide)
- **Confusion de types** : Une chaîne où un nombre est attendu est détectée avant de pouvoir causer des erreurs
- **Entrées surdimensionnées** : Les limites de longueur empêchent les abus (ex. mot de passe >= 8 caractères)
- **Application du format** : L'email doit être au format email valide, les UUID doivent être des UUID valides

**Où** : `backend/src/middleware/validate.middleware.ts` + dossier `backend/src/schemas/`

```typescript
// Exemple : schéma d'inscription
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});
```

**Format de réponse d'erreur** :
```json
{
  "success": false,
  "errors": [
    { "field": "email", "message": "Invalid email" },
    { "field": "password", "message": "String must contain at least 8 character(s)" }
  ]
}
```

**Routes validées** :
- `POST /auth/register` — email, mot de passe (>=8), nom (>=2)
- `POST /auth/login` — email, mot de passe
- `POST /auth/refresh` — refreshToken
- `POST /auth/verify-email` — email, code (6 chiffres)
- `POST /auth/forgot-password` — email
- `POST /auth/reset-password` — token, mot de passe (>=8)
- `PUT /users/me` — name, publicInfo, friendsInfo, privateInfo, musicPreferences
- `POST /events` — nom (>=2), description, isPublic, licenseType, heure/localisation
- `POST /events/:id/tracks` — title, artist, externalUrl, location
- `POST /events/:id/tracks/:trackId/vote` — latitude, longitude
- `POST /playlists` — nom (>=2), description, isPublic, licenseType
- `POST /playlists/:id/tracks` — title, artist, externalUrl
- `PUT /playlists/:id/tracks/:trackId/position` — newPosition (entier >= 0)
- `POST /events/:id/invite` — userId (UUID)
- `POST /playlists/:id/invite` — userId (UUID), canEdit (booléen)

---

## 7. Contrôle d'accès

**Ce que c'est** : Au-delà de l'authentification (qui êtes-vous ?), le contrôle d'accès vérifie l'autorisation (que pouvez-vous faire ?).

**Ce contre quoi ça protège** : Les utilisateurs qui accèdent ou modifient des ressources qu'ils ne devraient pas.

**Où** : Différents fichiers de services

| Vérification | Où | Ce que ça fait |
|-------------|-------|-------------|
| Créateur d'événement uniquement | `event.service.ts:119,139` | Seul le créateur peut modifier/supprimer un événement |
| Créateur de playlist uniquement | `playlist.service.ts:116,129` | Seul le créateur peut modifier/supprimer une playlist |
| Événements sur invitation | `event.service.ts:159` | Impossible de rejoindre un événement INVITE_ONLY sans invitation |
| Permission d'édition playlist | `playlist.service.ts:31-48` | Playlists INVITE_ONLY : doit être membre accepté avec `canEdit=true` |
| Permission de vue playlist | `playlist.service.ts:10-28` | Playlists privées : seuls les membres acceptés peuvent voir |
| Visibilité du profil | `user.service.ts` | Trois niveaux de visibilité : public, amis uniquement, privé |
| Appartenance à l'événement | `vote.service.ts:36-42` | Événements INVITE_ONLY : doit être membre pour voter |
| Contrôle localisation/temps | `vote.service.ts:44-63` | Événements LOCATION_TIME : doit être dans un rayon de 5 km + fenêtre temporelle |
| Fonctionnalité premium | `middleware/premium.middleware.ts` | Création de playlist derrière le paywall premium quand activé |

---

## 8. Prévention de l'injection SQL

**Ce que c'est** : L'ORM Prisma utilise des requêtes paramétrées, ce qui signifie que les entrées utilisateur ne sont jamais concaténées directement dans les chaînes SQL.

**Ce contre quoi ça protège** : L'injection SQL — où un attaquant soumet `'; DROP TABLE users; --` en entrée.

**Où** : Implicite dans tous les appels Prisma dans le codebase.

```typescript
// Ce qu'on écrit :
await prisma.user.findUnique({ where: { email } });

// Ce que Prisma génère (paramétré) :
// SELECT * FROM "User" WHERE "email" = $1  (avec $1 = valeur de l'email)

// PAS ceci (vulnérable) :
// SELECT * FROM "User" WHERE "email" = '${email}'
```

Combiné avec la validation Zod (qui assure les types corrects avant qu'ils n'atteignent Prisma), l'injection SQL est effectivement impossible dans ce codebase.

---

## 9. Journalisation des actions (Winston)

**Ce que c'est** : Chaque requête API est journalisée avec des métadonnées sur l'utilisateur, la plateforme et l'appareil.

**Ce contre quoi ça protège** : Fournit une piste d'audit pour investiguer les incidents de sécurité.

**Où** : `backend/src/config/logger.ts` (configuration du logger) + `backend/src/middleware/logger.middleware.ts` (journalisation des requêtes)

**Format du log** :
```
2024-03-01 14:30:00 [INFO] POST /api/events | user=abc-123 | platform=ios | device=iPhone 15 | version=1.0.0
```

**Stockage des logs** :
- Sortie console (développement)
- Fichier : `backend/logs/app.log` (max 5Mo, rotation, 3 fichiers conservés)

L'application mobile envoie la plateforme, l'appareil et la version de l'app à chaque requête via des headers personnalisés :
- `X-Platform` : ios, android, web
- `X-Device` : nom du modèle de l'appareil
- `X-App-Version` : version de l'app depuis `app.json`

**Fichier** : `mobile/src/services/api.ts:20-23` — L'intercepteur Axios ajoute ces headers.

---

## 10. Protection des données sensibles

### Variables d'environnement
Tous les secrets sont stockés dans des fichiers `.env` et jamais committés dans git :
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `DATABASE_URL`, `DIRECT_URL`

Les fichiers `.env.example` contiennent des valeurs vides comme modèles.

### Sécurité du token de réinitialisation de mot de passe
- Le token est une chaîne hexadécimale aléatoire cryptographiquement sécurisée de 32 octets (`crypto.randomBytes(32)`)
- Expire après 30 minutes
- Effacé de la base de données immédiatement après utilisation
- `forgotPassword()` retourne le même message que l'email existe ou non (empêche l'énumération d'emails)

### Sécurité du code de vérification email
- Code aléatoire à 6 chiffres
- Expire après 15 minutes
- Effacé de la base de données après vérification réussie

---

## Menaces identifiées et atténuations

### Implémentées

| Menace | Atténuation | Statut |
|--------|-------------|--------|
| Brute-force sur login | Limitation de débit (5 req/15min sur les routes auth) | Implémenté |
| JWT volé | Expiration courte (access token de 15min) | Implémenté |
| Fuite de mots de passe | Hashage bcrypt (10 tours) | Implémenté |
| XSS | Headers de sécurité Helmet | Implémenté |
| Clickjacking | X-Frame-Options via Helmet | Implémenté |
| Injection SQL | Requêtes paramétrées Prisma + validation Zod | Implémenté |
| Entrées invalides | Schémas Zod sur toutes les routes | Implémenté |
| Accès non autorisé | Middleware JWT + vérifications de contrôle d'accès | Implémenté |
| CSRF | Non applicable (l'API utilise des Bearer tokens, pas des cookies) | N/A |

### Non implémentées (améliorations possibles)

| Menace | Atténuation possible | Pourquoi non implémentée |
|--------|---------------------|--------------------------|
| Vol de token via accès à l'appareil | Stockage chiffré des tokens (Expo SecureStore) | AsyncStorage est suffisant pour cette portée |
| Réutilisation du refresh token | Liste noire de tokens / rotation avec stockage en BDD | Ajouterait de la complexité ; l'approche actuelle est acceptable |
| DDoS | WAF cloud (Cloudflare, AWS Shield) | Préoccupation au niveau infrastructure, pas applicatif |
| Prise de contrôle de compte via email | 2FA (TOTP/SMS) | Hors périmètre du projet |
| Fuite de clé API | Rotation de clé API + coffre-fort (HashiCorp Vault) | Une seule API (Google), gérée via variables d'environnement |
| Fixation de session | Non applicable (JWT stateless, pas de sessions serveur) | N/A |
