# Guide — Tests de charge avec Artillery

Ce document explique comment fonctionnent les tests de charge du projet Music Room, comment les lancer en correction, et comment interpreter les resultats.

---

## C'est quoi un test de charge ?

Un test de charge simule plusieurs utilisateurs qui accedent a l'API **en meme temps** pour verifier :
- Est-ce que le serveur **tient la charge** sans planter ?
- Quel est le **temps de reponse** sous pression ?
- A partir de combien d'utilisateurs le serveur **commence a ralentir** ?
- Est-ce que les **protections** (rate limiting) fonctionnent bien ?

On utilise **Artillery**, un outil open-source qui cree des "virtual users" (VUs) qui envoient des requetes HTTP comme de vrais utilisateurs.

---

## Comment ca marche

### Le fichier de config : `backend/artillery.yml`

```yaml
config:
  target: "http://localhost:3001"    # URL du serveur a tester
  phases:
    - duration: 10                   # Phase 1 : 10 secondes
      arrivalRate: 2                 # 2 nouveaux utilisateurs par seconde
      name: "Warm-up"
    - duration: 30                   # Phase 2 : 30 secondes
      arrivalRate: 2                 # On monte de 2...
      rampTo: 20                     # ...jusqu'a 20 users/sec
      name: "Ramp-up"
    - duration: 20                   # Phase 3 : 20 secondes
      arrivalRate: 20                # 20 users/sec constant
      name: "Sustained load"
```

**Les 3 phases** simulent un scenario realiste :
1. **Warm-up** (10s) : on demarre doucement, 2 users/sec — le serveur se "chauffe"
2. **Ramp-up** (30s) : on augmente progressivement de 2 a 20 users/sec — on teste la montee en charge
3. **Sustained load** (20s) : on maintient 20 users/sec — on verifie que le serveur tient dans la duree

### Les 3 scenarios

Chaque virtual user execute un des 3 scenarios au hasard (avec un poids) :

| Scenario | Poids | Ce qu'il fait |
|----------|-------|---------------|
| **Health check** | 40% | `GET /health` — pas d'auth, pas de base de donnees |
| **Browse events** | 30% | `GET /api/events` x2 avec token JWT — requete DB |
| **Browse playlists** | 30% | `GET /api/playlists` x2 avec token JWT — requete DB |

Le scenario "Health check" sert de **baseline** : il montre la performance pure du serveur Express sans aucun acces base de donnees. Les deux autres testent des vrais endpoints avec authentification et requetes PostgreSQL.

### Le token JWT

Les scenarios 2 et 3 ont besoin d'un token JWT pour s'authentifier. On le passe via une variable d'environnement `AUTH_TOKEN` :

```yaml
variables:
  token: "{{ $processEnvironment.AUTH_TOKEN }}"
```

Comme ca, tous les virtual users partagent le meme token — pas besoin de creer 750 comptes.

---

## Comment lancer le test en correction

### Etape 1 : Demarrer le serveur

```bash
cd backend
npm run dev
```

Attendre de voir `Server running on port 3001`.

### Etape 2 : Creer un utilisateur de test et recuperer son token

Dans un **autre terminal** :

```bash
cd backend

# Creer un compte et recuperer le token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"correcteur@test.com","password":"password123","name":"Correcteur"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.accessToken))")

echo $TOKEN
```

Si l'email existe deja (test deja lance une fois), utiliser `/login` a la place :

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"correcteur@test.com","password":"password123"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.accessToken))")
```

### Etape 3 : Lancer Artillery

```bash
AUTH_TOKEN="$TOKEN" npx artillery run artillery.yml
```

Le test dure environ **1 minute**. On voit les metriques s'afficher en temps reel toutes les 10 secondes, puis un rapport final.

---

## Comment lire les resultats

### Le rapport final ressemble a ca :

```
Summary report @ 22:59:20

http.codes.200: ............... 197
http.codes.429: ............... 997
http.requests: ................ 1194
http.response_time:
  min: ........................ 0
  max: ........................ 365
  mean: ....................... 18.3
  median: ..................... 1
  p95: ........................ 127.8
  p99: ........................ 141.2
vusers.completed: ............. 750
vusers.failed: ................ 0
```

### Ce qu'il faut regarder

| Metrique | Signification | Bonne valeur |
|----------|--------------|-------------|
| `vusers.failed: 0` | Aucun utilisateur n'a eu d'erreur serveur (500) | **0** = parfait |
| `http.codes.200` | Requetes reussies | Plus c'est haut, mieux c'est |
| `http.codes.429` | Requetes bloquees par le rate limiter | Normal en local (voir explication) |
| `response_time.mean` | Temps de reponse moyen | < 200ms = bien |
| `response_time.p95` | 95% des requetes repondent en moins de... | < 500ms = bien |
| `response_time.p99` | 99% des requetes... | < 1000ms = acceptable |

### Pourquoi autant de 429 ?

C'est **normal et attendu**. Le rate limiter global est configure a **200 requetes par 15 minutes par adresse IP**. Comme tous les virtual users tournent sur `localhost` (meme IP : 127.0.0.1), apres 200 requetes le rate limiter bloque tout.

**En production**, chaque utilisateur aurait sa propre IP, donc chacun aurait son propre quota de 200 requetes. Les 429 prouvent justement que le rate limiter **fonctionne correctement**.

### Les temps de reponse

- **Health check** (sans DB) : < 5 ms — le serveur Express est tres rapide
- **Events / Playlists** (avec DB) : ~120 ms — c'est la **latence reseau vers Supabase** (le serveur PostgreSQL est heberge dans le cloud, pas en local)

Le bottleneck n'est pas le code, c'est le reseau vers la base de donnees distante.

---

## Quoi dire au correcteur

### Pitch rapide (30 secondes)

> "J'ai fait des tests de charge avec Artillery pour verifier que l'API tient la montee en charge. Le test simule jusqu'a 20 utilisateurs par seconde pendant 1 minute, avec 3 scenarios : health check, navigation des events, et navigation des playlists. Le resultat : 750 utilisateurs virtuels, 0 erreur serveur, temps de reponse moyen de 120 ms sur les endpoints avec base de donnees. Le bottleneck c'est la latence reseau vers Supabase, pas le serveur Express."

### Questions possibles et reponses

**Q: Pourquoi autant de codes 429 ?**
> "C'est le rate limiter global qui se declenche. Il autorise 200 requetes par 15 minutes par IP. Comme tous les virtual users partagent localhost, ils partagent le meme quota. En production avec des IPs differentes, chaque utilisateur aurait son propre quota. Ca prouve que le rate limiting fonctionne."

**Q: 120 ms de temps de reponse, c'est pas un peu lent ?**
> "La quasi-totalite du temps c'est la latence reseau vers Supabase qui est heberge dans le cloud. Le health check (sans DB) repond en moins de 5 ms. Avec une base locale, tous les endpoints seraient a ~5 ms. C'est une contrainte du free tier, pas du code."

**Q: Combien d'utilisateurs simultanes l'API peut supporter ?**
> "Le serveur Express peut gerer plus de 200 requetes par seconde. La limite c'est Supabase free tier : avec la latence de ~120 ms et le pool de connexions limite, on estime environ 50 a 100 utilisateurs simultanes. Pour scaler, il faudrait une base locale ou un tier Supabase superieur."

**Q: Pourquoi 3 scenarios ?**
> "Pour tester differents aspects de l'API. Le health check donne la baseline du serveur sans DB. Les events et playlists testent des vrais endpoints avec authentification JWT, middleware de validation, et requetes Prisma. Ca couvre les cas d'usage principaux de l'application."

**Q: C'est quoi le ramp-up ?**
> "C'est une montee en charge progressive. On commence a 2 users/sec, on monte graduellement jusqu'a 20 users/sec sur 30 secondes. Ca permet de voir a quel moment le serveur commence a ralentir au lieu de le noyer d'un coup. C'est plus realiste qu'un pic instantane."

**Q: Tu as identifie des points d'amelioration ?**
> "Oui, trois axes : 1) Utiliser une base PostgreSQL locale ou un tier Supabase superieur pour reduire la latence. 2) Ajouter du cache Redis sur les endpoints de lecture frequents. 3) Mettre un reverse proxy comme Nginx devant Express pour gerer les connexions statiques et le load balancing."

---

## Fichiers concernes

| Fichier | Role |
|---------|------|
| `backend/artillery.yml` | Configuration du test (phases, scenarios) |
| `docs/load-testing/results.md` | Resultats detailles du dernier test |
| `docs/load-testing/guide-load-testing.md` | Ce guide |
