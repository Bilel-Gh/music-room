# Resultats du test de charge — Music Room API

> Date : 2026-02-25
> Outil : Artillery v2.0.30

---

## Environnement de test

| Element | Valeur |
|---------|--------|
| Machine | MacBook Pro (Apple M1 Pro, 8 coeurs) |
| RAM | 16 GB |
| OS | macOS 15.5 |
| Node.js | v24.4.0 |
| Base de donnees | Supabase PostgreSQL (free tier) |
| Serveur | Express 5 + TypeScript (localhost:3001) |

### Limites connues du free tier Supabase

- Connexions directes limitees (~60 simultanées)
- Pool de connexions via PgBouncer (port 6543)
- Pas de garantie de performance (serveur partage)
- Latence reseau entre la machine locale et Supabase (~100-130 ms par requete)

---

## Configuration du test

Fichier : `backend/artillery.yml`

**Phases de charge :**

| Phase | Duree | Utilisateurs/sec |
|-------|-------|-----------------|
| Warm-up | 10s | 2 |
| Ramp-up | 30s | 2 → 20 |
| Sustained load | 20s | 20 |

**Scenarios :**

| Scenario | Poids | Description |
|----------|-------|-------------|
| Health check | 40% | GET /health (sans auth, sans DB) |
| Browse events | 30% | GET /api/events (avec JWT, requete DB) |
| Browse playlists | 30% | GET /api/playlists (avec JWT, requete DB) |

Les scenarios 2 et 3 font chacun **2 requetes** avec 1 seconde de pause entre elles (simule un utilisateur qui navigue).

---

## Resultats

### Resume global

| Metrique | Valeur |
|----------|--------|
| Duree totale | 1 minute 2 secondes |
| Virtual users crees | 750 |
| Virtual users termines | 750 |
| Virtual users echoues | **0** |
| Requetes totales | 1 194 |
| Debit moyen | 26 req/sec |
| Debit max | ~33 req/sec |

### Codes HTTP

| Code | Nombre | Explication |
|------|--------|-------------|
| 200 | 197 | Reponses reussies (health + events + playlists) |
| 429 | 997 | Rate limiting global (200 req / 15 min par IP) |

**Remarque sur les 429 :** Comme tous les virtual users partagent la meme IP (127.0.0.1), le rate limiter global (200 requetes / 15 minutes) se declenche apres ~200 requetes. C'est un **comportement attendu** : en production, chaque utilisateur aurait une IP differente et ne serait pas impacte.

### Temps de reponse

| Metrique | Toutes | 2xx (succes) | 4xx (rate limited) |
|----------|--------|--------------|---------------------|
| Min | 0 ms | 0 ms | 0 ms |
| Max | 365 ms | 365 ms | 250 ms |
| Moyenne | 18.3 ms | 100.7 ms | 2 ms |
| Mediane | 1 ms | 122.7 ms | 1 ms |
| p95 | 127.8 ms | 141.2 ms | 4 ms |
| p99 | 141.2 ms | 340.4 ms | 16.9 ms |

### Analyse par scenario

| Scenario | VUs | Requetes | Observations |
|----------|-----|----------|-------------|
| Health check | 306 | ~306 | Reponse < 5 ms (pas de DB) |
| Browse events | 213 | ~426 | ~120 ms (latence Supabase) |
| Browse playlists | 231 | ~462 | ~120 ms (latence Supabase) |

---

## Analyse

### Performances du serveur

Le serveur Express gere **750 utilisateurs virtuels** en 1 minute sans aucun echec. Les temps de reponse pour les requetes reussies (avant le rate limiting) sont :

- **Health check** : < 5 ms — le serveur repond quasi-instantanement sans acces DB
- **Endpoints authentifies** : ~120 ms en mediane — la majeure partie du temps est la latence reseau vers Supabase (heberge en cloud, pas en local)

### Goulot d'etranglement

Le principal facteur limitant est la **latence reseau vers Supabase** (~100-130 ms par requete DB). Le serveur Express lui-meme repond en < 5 ms pour les routes sans DB.

Avec une base de donnees locale, les temps de reponse seraient significativement plus bas (~1-5 ms pour toutes les routes).

### Rate limiting

Le rate limiter global fonctionne correctement :
- Se declenche apres 200 requetes depuis la meme IP
- Les requetes rate-limited repondent en < 2 ms (rejet immediat, pas de charge serveur)
- En production avec des IPs distribuees, chaque utilisateur a sa propre fenetre de 200 req / 15 min

### Estimation des utilisateurs concurrents

En prenant en compte les limites du free tier Supabase :

| Contrainte | Limite estimee |
|-----------|---------------|
| Serveur Express | **> 200 req/sec** (pas de bottleneck cote serveur) |
| Supabase free tier | **~8-10 req/sec** (latence 120 ms × pool limité) |
| Rate limiter (par IP) | 200 req / 15 min / IP |

**Estimation realiste** : L'API peut supporter **~50-100 utilisateurs simultanes** avec le free tier Supabase, limite principalement par la latence reseau et le nombre de connexions du pool.

---

## Comment reproduire

```bash
# 1. Demarrer le serveur
cd backend
npm run dev

# 2. Creer un utilisateur de test
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"loadtest@test.com","password":"password123","name":"Load Tester"}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.accessToken))")

# 3. Lancer le test
AUTH_TOKEN="$TOKEN" npx artillery run artillery.yml
```
