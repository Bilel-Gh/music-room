# Google OAuth 2.0 — Setup & Explications

## C'est quoi OAuth 2.0 ?

Imagine que tu veux te connecter à une app (Music Room) mais sans créer un nouveau mot de passe. Tu cliques "Se connecter avec Google", Google te demande "Est-ce que tu autorises Music Room à voir ton nom et ton email ?", tu dis oui, et c'est fait — tu es connecté.

OAuth 2.0 c'est le protocole qui gère tout ca. Personne n'échange de mot de passe. Google sert d'intermédiaire de confiance.

En résumé : **l'utilisateur ne donne jamais son mot de passe Google à notre app.** C'est Google qui confirme l'identité et nous transmet les infos autorisées.

---

## C'est quoi le Client ID et le Client Secret ?

Quand tu crées un projet sur Google Cloud Console, Google te donne deux clés :

**Client ID** — C'est la carte d'identité publique de ton application. Quand un utilisateur clique "Se connecter avec Google", Google voit ce Client ID et sait que c'est Music Room qui fait la demande. Cette valeur n'est pas secrète en soi — elle apparaît même dans les URLs de redirection.

Exemple : `123456789-abc123xyz.apps.googleusercontent.com`

**Client Secret** — C'est le mot de passe privé de ton application. Il prouve à Google que c'est bien TON serveur qui fait la demande, pas quelqu'un qui aurait copié ton Client ID. Cette valeur ne doit **jamais** être exposée publiquement (pas dans le code, pas dans le repo Git, uniquement dans le `.env`).

Exemple : `GOCSPX-aB3dEf_gH1jKlMn0pQrS`

L'analogie simple : le Client ID c'est ton nom affiché sur la porte. Le Client Secret c'est la clé pour ouvrir la porte. Tout le monde peut voir ton nom, mais seul toi as la clé.

---

## Le flux OAuth 2.0 complet (ce qui se passe concrètement)

Voici ce qui se passe quand un utilisateur clique "Se connecter avec Google" dans l'app :

```
1. L'utilisateur clique "Se connecter avec Google"
         │
         ▼
2. L'app mobile redirige vers notre backend
   GET /api/auth/google
         │
         ▼
3. Notre backend (via Passport.js) redirige vers Google
   "Bonjour Google, je suis Music Room (voici mon Client ID),
    je voudrais le nom et l'email de cet utilisateur"
         │
         ▼
4. Google affiche l'écran de consentement à l'utilisateur
   "Music Room veut accéder à votre nom et email. OK ?"
         │
         ▼
5. L'utilisateur accepte. Google redirige vers notre callback
   GET /api/auth/google/callback?code=XXXXX
   Google nous envoie un "code" temporaire
         │
         ▼
6. Notre backend échange ce code + Client Secret contre les infos
   (Cet échange est invisible pour l'utilisateur, c'est serveur → Google)
   Google vérifie le Client Secret et répond avec : nom, email, googleId
         │
         ▼
7. Notre backend crée ou retrouve l'utilisateur en base
   → Génère nos propres JWT tokens
   → Renvoie les tokens à l'app mobile
         │
         ▼
8. L'utilisateur est connecté.
```

Le point important : à l'étape 6, c'est le **Client Secret** qui prouve à Google que la demande vient bien de notre serveur. Sans lui, n'importe qui pourrait se faire passer pour notre app.

---

## Comment j'ai obtenu mes credentials (étapes)

### Étape 1 — Créer un projet Google Cloud

1. Aller sur [console.cloud.google.com](https://console.cloud.google.com)
2. En haut à gauche, cliquer sur le sélecteur de projet → **"New Project"**
3. Nom du projet : `Music Room`
4. Cliquer **"Create"**
5. S'assurer que le projet "Music Room" est bien sélectionné en haut

### Étape 2 — Configurer l'écran de consentement OAuth

C'est l'écran que Google affiche à l'utilisateur quand il clique "Se connecter avec Google". On doit dire à Google quoi afficher.

1. Menu latéral → **APIs & Services** → **OAuth consent screen**
2. Choisir **"External"** (n'importe quel compte Google peut se connecter)
3. Remplir les champs obligatoires :
   - **App name** : `Music Room`
   - **User support email** : ton email
   - **Developer contact email** : ton email
4. Le reste est optionnel pour le moment — cliquer **"Save and Continue"**
5. Sur la page **Scopes** : cliquer "Add or remove scopes"
   - Cocher `email` et `profile` (on veut juste le nom et l'email)
   - Sauvegarder
6. Sur la page **Test users** : ajouter ton adresse Gmail
   - Tant que l'app est en mode "Testing", seuls ces comptes pourront se connecter
   - C'est parfait pour le dev et la soutenance

### Étape 3 — Créer les credentials OAuth 2.0

1. Menu latéral → **APIs & Services** → **Credentials**
2. Cliquer **"+ Create Credentials"** → **"OAuth 2.0 Client ID"**
3. Application type : **Web application**
4. Nom : `Music Room Backend` (juste pour s'y retrouver)
5. **Authorized redirect URIs** : ajouter
   ```
   http://localhost:3001/api/auth/google/callback
   ```
   C'est l'URL vers laquelle Google redirige l'utilisateur après qu'il a accepté. Elle doit correspondre exactement à la route qu'on a définie dans notre backend.
6. Cliquer **"Create"**

### Étape 4 — Récupérer et stocker les clés

Google affiche une popup avec :
- **Your Client ID** : `123456789-xxxxxxx.apps.googleusercontent.com`
- **Your Client Secret** : `GOCSPX-xxxxxxxxxx`

Copier ces deux valeurs dans le fichier `.env` du backend :

```dotenv
GOOGLE_CLIENT_ID=123456789-xxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxx
```

Ne jamais commit ce fichier. Le `.gitignore` l'exclut déjà.

---

## Pourquoi "mode Testing" et pas "Published" ?

Quand tu configures l'écran de consentement, Google met ton app en mode **Testing** par défaut.

| | Testing | Published |
|---|---|---|
| **Qui peut se connecter** | Seulement les test users que tu as ajoutés | Tout le monde |
| **Vérification Google** | Pas nécessaire | Google doit approuver ton app (ça prend des semaines) |
| **Pour notre projet** | Parfait — on ajoute les correcteurs comme test users si besoin | Inutile et trop long |

Pour la soutenance, deux options :
- Soit tu ajoutes l'email Google du correcteur en test user avant la démo
- Soit tu montres que le flux fonctionne avec ton propre compte (plus simple)

---

## Résumé de ce qui est dans mon .env

```dotenv
# Base de données (Supabase héberge le PostgreSQL)
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres

# Auth - JWT (clés qu'on a générées nous-mêmes pour signer nos tokens)
JWT_SECRET=une-chaine-aleatoire-longue
JWT_REFRESH_SECRET=une-autre-chaine-aleatoire-longue

# Auth - Google OAuth (obtenu via Google Cloud Console)
GOOGLE_CLIENT_ID=123456789-xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxx

# Config serveur
PORT=3001
CLIENT_URL=http://localhost:8081
```

Chaque variable a un rôle précis :
- **DATABASE_URL / DIRECT_URL** → Prisma se connecte à la base Supabase
- **JWT_SECRET / JWT_REFRESH_SECRET** → On signe nos propres tokens d'authentification avec
- **GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET** → Google nous identifie quand un utilisateur fait "Se connecter avec Google"
- **PORT** → Le port sur lequel le backend Express écoute
- **CLIENT_URL** → L'adresse de l'app mobile/web (pour les redirections CORS et après OAuth)
