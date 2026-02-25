# Securite — Menaces identifiees et protections

Ce document liste les menaces de securite identifiees pour l'application Music Room et les protections mises en place.

---

## 1. Attaques par force brute sur l'authentification

**Menace :** Un attaquant tente des milliers de combinaisons email/mot de passe pour deviner les identifiants d'un utilisateur.

**Protection : Rate limiting (`express-rate-limit`)**

Les routes sensibles (`/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`) sont protegees par un rate limiter strict :
- **5 requetes maximum** par adresse IP par fenetre de **15 minutes**
- Au-dela, le serveur repond `429 Too Many Requests`

```typescript
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { success: false, error: 'Too many requests, please try again later' },
});
```

Un rate limiter global (200 requetes / 15 min) est aussi applique sur toute l'API pour eviter les abus.

---

## 2. Vol ou falsification de tokens d'authentification

**Menace :** Un attaquant intercepte ou fabrique un token JWT pour se faire passer pour un utilisateur.

**Protection : JWT signe avec un secret**

- Les tokens sont signes avec `JWT_SECRET` (cle secrete stockee dans `.env`, jamais dans le code)
- L'**access token** expire au bout de **15 minutes** — meme si vole, il est utilisable tres peu de temps
- Le **refresh token** expire au bout de **7 jours** et sert uniquement a obtenir un nouvel access token
- Si le secret change, tous les tokens existants deviennent invalides

**Pourquoi deux tokens ?**
L'access token est envoye a chaque requete (plus expose). Le refresh token est utilise rarement et peut etre stocke de facon plus securisee cote client.

---

## 3. Stockage des mots de passe en clair

**Menace :** Si la base de donnees est compromise, les mots de passe des utilisateurs sont lisibles.

**Protection : Hashage avec bcrypt**

- Les mots de passe ne sont **jamais stockes en clair**
- On utilise `bcrypt` avec **10 salt rounds** (le hash est different a chaque fois, meme pour le meme mot de passe)
- Pour verifier un mot de passe, bcrypt re-hash la tentative et compare — on ne peut pas "dehash"

```
En base : "$2b$10$N9qo8uLOickgx2ZMRZoMye..."
En clair : jamais stocke
```

---

## 4. Injection SQL

**Menace :** Un attaquant envoie du SQL malveillant dans les champs de formulaire pour manipuler la base de donnees.

**Protection : Prisma ORM (requetes parametrees)**

- Prisma genere des **requetes parametrees** (prepared statements) — les donnees utilisateur ne sont jamais concatenees dans le SQL
- Meme si un utilisateur envoie `'; DROP TABLE User; --` dans un champ, Prisma le traite comme une simple chaine de caracteres

```typescript
// Prisma echappe automatiquement les valeurs
const user = await prisma.user.findUnique({ where: { email: userInput } });
// ↓ SQL genere : SELECT * FROM "User" WHERE email = $1 (parametre, pas concatenation)
```

---

## 5. Donnees invalides ou malformees

**Menace :** Un attaquant envoie des donnees inattendues (champs manquants, types incorrects, valeurs hors limites) pour provoquer des erreurs ou des comportements inattendus.

**Protection : Validation Zod sur toutes les routes**

- Chaque route qui recoit des donnees a un schema Zod qui valide le body **avant** qu'il n'atteigne la logique metier
- Si les donnees sont invalides, la requete est rejetee avec `400 Bad Request` et un message clair

```typescript
const registerSchema = z.object({
  email: z.email(),                  // doit etre un email valide
  password: z.string().min(8),       // minimum 8 caracteres
  name: z.string().min(2),           // minimum 2 caracteres
});
```

Les routes protegees :
- Auth : register, login, refresh, verify-email, forgot-password, reset-password, link-google
- Users : updateProfile
- Events : createEvent, updateEvent, addTrack, vote, joinEvent
- Playlists : createPlaylist, updatePlaylist, addTrack, reorderTrack, inviteUser

---

## 6. Attaques HTTP courantes (XSS, clickjacking, MIME sniffing...)

**Menace :** Differentes attaques exploitant les en-tetes HTTP par defaut des navigateurs.

**Protection : Helmet**

`helmet` est un middleware Express qui configure automatiquement des en-tetes de securite :

| En-tete | Protection |
|---------|-----------|
| `X-Content-Type-Options: nosniff` | Empeche le navigateur de deviner le type MIME |
| `X-Frame-Options: SAMEORIGIN` | Bloque l'affichage dans une iframe (anti-clickjacking) |
| `X-XSS-Protection: 0` | Desactive le filtre XSS du navigateur (obsolete, peut causer des problemes) |
| `Strict-Transport-Security` | Force HTTPS |
| `Content-Security-Policy` | Controle les sources de contenu autorisees |

```typescript
app.use(helmet());
```

---

## 7. Requetes cross-origin non autorisees

**Menace :** Un site malveillant envoie des requetes a notre API depuis le navigateur d'un utilisateur connecte.

**Protection : CORS**

```typescript
app.use(cors());
```

En production, on restreindrait l'origin a notre domaine client specifique. Pour le developpement, CORS est ouvert.

---

## 8. Enumeration d'emails

**Menace :** Un attaquant essaie de deviner quels emails sont inscrits en observant les messages d'erreur.

**Protections :**

- **Login** : le message d'erreur est le meme que l'email existe ou non (`"Invalid email or password"`)
- **Forgot password** : la reponse est toujours `200 OK` avec le meme message, que l'email soit inscrit ou non
- **Profils prives** : renvoient `404` (pas `403`) pour ne pas reveler l'existence de la ressource

---

## 9. Absence de tracabilite

**Menace :** Impossible de detecter ou analyser une attaque en cours sans logs.

**Protection : Winston logger**

Chaque requete est loguee avec :
- **Methode HTTP** et **URL**
- **ID utilisateur** (ou "anonymous" si non authentifie)
- **Plateforme** (header `x-platform` : iOS, Android...)
- **Appareil** (header `x-device` : iPhone 13, Samsung S22...)
- **Version de l'app** (header `x-app-version`)

Format des logs :
```
2026-02-25 20:30:00 [INFO] POST /api/auth/login | user=anonymous | platform=iOS | device=iPhone 13 | version=1.2.0
2026-02-25 20:30:01 [INFO] GET /api/events | user=abc-123 | platform=Android | device=Samsung S22 | version=1.2.0
```

Les logs sont ecrits dans la console ET dans un fichier (`logs/app.log`), avec rotation (max 5 Mo, 3 fichiers).

---

## 10. Fuite de variables sensibles

**Menace :** Les cles secretes (JWT_SECRET, DATABASE_URL, etc.) se retrouvent dans le code source.

**Protections :**

- Toutes les variables sensibles sont dans `.env` (jamais dans le code)
- `.env` est dans `.gitignore` — il ne sera **jamais** commite
- Un `.env.example` avec des valeurs vides est fourni pour documenter les variables necessaires
- `logs/` et `*.log` sont aussi ignores par Git

---

## 11. Acces non autorise aux ressources

**Menace :** Un utilisateur accede a des donnees ou actions qui ne lui appartiennent pas.

**Protections :**

| Ressource | Protection |
|-----------|-----------|
| Profils utilisateurs | Visibilite a 3 niveaux (public, amis, prive) |
| Events INVITE_ONLY | Seuls les membres peuvent voter/ajouter des tracks |
| Events LOCATION_TIME | Verification de la distance (< 5 km) et du creneau horaire |
| Playlists INVITE_ONLY | Seuls les membres avec `canEdit = true` peuvent modifier |
| Playlists privees | Renvoient 404 aux non-membres |
| Modification/suppression | Seul le createur peut modifier ou supprimer ses evenements/playlists |

---

## Resume des protections

| Menace | Protection | Outil |
|--------|-----------|-------|
| Force brute | Rate limiting (5 req / 15 min sur auth) | `express-rate-limit` |
| Vol de token | JWT signe + expiration courte | `jsonwebtoken` |
| Mots de passe | Hashage irreversible | `bcrypt` (10 rounds) |
| Injection SQL | Requetes parametrees | `Prisma` |
| Donnees invalides | Validation stricte | `Zod` |
| Attaques HTTP | En-tetes de securite | `helmet` |
| Cross-origin | Politique CORS | `cors` |
| Enumeration | Messages d'erreur uniformes | Code applicatif |
| Tracabilite | Logging de chaque action | `winston` |
| Fuite de secrets | Variables dans .env, gitignore | `.env` + `.gitignore` |
| Acces non autorise | Verification des permissions | Middleware + services |
