# Tests de charge — Music Room

## Qu'est-ce que les tests de charge ?

Les tests de charge simulent plusieurs utilisateurs qui frappent l'API simultanément pour découvrir comment le backend se comporte sous pression. L'objectif est de répondre à : "Combien d'utilisateurs simultanés le backend peut-il gérer avant de commencer à échouer ou ralentir ?"

## Outil utilisé : Artillery

**Artillery** est un outil de test de charge qui simule des utilisateurs virtuels envoyant des requêtes HTTP à l'API. Il est configuré via un fichier YAML qui définit des phases (préchauffage, montée en charge, charge soutenue) et des scénarios (ce que chaque utilisateur virtuel fait).

**Pourquoi Artillery** : Il est simple à configurer, supporte les phases pour une augmentation graduelle de la charge, s'intègre avec Node.js, et produit des métriques claires. Des alternatives comme k6 ou JMeter existent, mais Artillery est le plus simple pour notre cas d'usage.

**Fichier** : `backend/artillery.yml`

## Configuration des tests

```yaml
config:
  target: "http://localhost:3001"
  phases:
    - duration: 10        # Phase 1 : Préchauffage
      arrivalRate: 2      # 2 nouveaux utilisateurs par seconde
      name: "Préchauffage"

    - duration: 30        # Phase 2 : Montée en charge
      arrivalRate: 2      # Commence à 2 utilisateurs/sec
      rampTo: 20          # Augmente graduellement jusqu'à 20 utilisateurs/sec
      name: "Montée en charge"

    - duration: 20        # Phase 3 : Charge soutenue
      arrivalRate: 20     # 20 nouveaux utilisateurs par seconde
      name: "Charge soutenue"
```

### Explication des phases

| Phase | Durée | Utilisateurs/sec | Objectif |
|-------|-------|-----------------|----------|
| **Préchauffage** | 10 sec | 2/sec | Laisser le serveur se réchauffer (JIT, pools de connexions) |
| **Montée en charge** | 30 sec | 2→20/sec | Augmenter progressivement la charge pour trouver le point de rupture |
| **Charge soutenue** | 20 sec | 20/sec | Maintenir la charge maximale pour voir si le serveur reste stable |

**Total d'utilisateurs virtuels** : ~20 (préchauffage) + ~330 (montée) + ~400 (soutenue) ≈ **750 utilisateurs virtuels** sur 60 secondes.

### Scénarios

Trois scénarios avec distribution pondérée :

| Scénario | Poids | Ce qu'il fait |
|----------|-------|---------------|
| **Vérification de santé** | 4/10 (40%) | `GET /health` — base simple sans authentification |
| **Parcourir les événements** | 3/10 (30%) | `GET /api/events` deux fois avec une pause de 1 seconde (authentifié) |
| **Parcourir les playlists** | 3/10 (30%) | `GET /api/playlists` deux fois avec une pause de 1 seconde (authentifié) |

Les scénarios authentifiés utilisent un token JWT passé via la variable d'environnement `AUTH_TOKEN`.

## Comment exécuter les tests

```bash
# 1. Démarrer le backend
make dev

# 2. Obtenir un token JWT (se connecter et copier l'accessToken)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"password123"}'

# 3. Lancer Artillery avec le token
AUTH_TOKEN="eyJhbG..." make load-test
```

Ou directement :
```bash
cd backend && AUTH_TOKEN="eyJhbG..." npx artillery run artillery.yml
```

## Comment lire les résultats

Artillery produit des métriques en trois sections :

### 1. Métriques résumées

```
All VUs finished. Total time: 60 seconds

Summary report:
  Scenarios launched:  750
  Scenarios completed: 748
  Requests completed:  1496
  RPS sent:            24.93
```

| Métrique | Signification |
|----------|---------------|
| **Scenarios launched** | Nombre total d'utilisateurs virtuels créés |
| **Scenarios completed** | Combien ont terminé sans erreur |
| **Requests completed** | Nombre total de requêtes HTTP envoyées (certains scénarios ont 2 requêtes) |
| **RPS sent** | Requêtes Par Seconde — le débit |

### 2. Temps de réponse

```
  http.response_time:
    min: 5
    max: 450
    median: 25
    p95: 120
    p99: 350
```

| Métrique | Signification | Bonne valeur |
|----------|---------------|-------------|
| **min** | Réponse la plus rapide | < 50ms |
| **max** | Réponse la plus lente | < 1000ms |
| **median** | 50% des requêtes étaient plus rapides | < 100ms |
| **p95** | 95% des requêtes étaient plus rapides | < 500ms |
| **p99** | 99% des requêtes étaient plus rapides | < 1000ms |

### 3. Codes de statut

```
  http.codes.200: 1400
  http.codes.401: 50
  http.codes.429: 46
```

| Code | Signification |
|------|---------------|
| **200** | Réponses réussies |
| **401** | Token expiré ou invalide (attendu si le token expire pendant le test) |
| **429** | Limité en débit (attendu — prouve que le rate limiting fonctionne !) |

## Contexte de l'infrastructure

### Spécifications du serveur

Les tests s'exécutent sur une **machine de développement locale** (pas un serveur de production) :

| Composant | Spécification |
|-----------|---------------|
| **CPU** | Machine de développement (variable) |
| **RAM** | Machine de développement (variable) |
| **Node.js** | Boucle événementielle mono-thread |
| **Base de données** | PostgreSQL Supabase offre gratuite |
| **Réseau** | Localhost (pas de latence réseau) |

### Limitations de l'offre gratuite Supabase

| Ressource | Limite |
|-----------|--------|
| **Taille de la base** | 500 Mo |
| **Connexions** | ~60 simultanées |
| **Bande passante** | 5 Go/mois |
| **Région** | Région unique |

Le principal goulot d'étranglement est le **pool de connexions Supabase** (~60 connexions). Sous forte charge, les requêtes à la base de données peuvent s'empiler en attendant une connexion libre.

## Ce que les résultats signifient pour le projet

### Capacité attendue

Avec la configuration actuelle (une seule instance Node.js + offre gratuite Supabase) :
- **Charge légère** (< 50 utilisateurs simultanés) : Temps de réponse sous 100ms, pas d'erreurs
- **Charge moyenne** (50-100 utilisateurs simultanés) : Temps de réponse sous 500ms, quelques 429 du rate limiting
- **Charge forte** (> 100 utilisateurs simultanés) : Saturation du pool de connexions à la base, latence accrue, quelques timeouts

### Dans le contexte du projet

C'est un projet scolaire évalué sur l'architecture et la qualité du code, pas sur la scalabilité en production. Les tests de charge démontrent :

1. **Le backend gère les requêtes concurrentes** sans planter
2. **Le rate limiting fonctionne** (les réponses 429 apparaissent sous forte charge)
3. **L'architecture est saine** — Express gère les requêtes de manière asynchrone, Prisma gère le pool de connexions
4. **Le goulot d'étranglement est identifié** : la base de données Supabase en offre gratuite, pas le code applicatif

### Comment améliorer la capacité (pour référence)

| Amélioration | Impact |
|-------------|--------|
| Plan Supabase payant (plus de connexions) | 2-5x plus de requêtes BDD simultanées |
| Pool de connexions (PgBouncer) | Meilleure réutilisation des connexions |
| Mode cluster PM2 (plusieurs instances Node.js) | Mise à l'échelle linéaire avec les cœurs CPU |
| Cache Redis pour les endpoints de lecture | Réduction de 50%+ de la charge sur la base |
| Indexation de la base sur les colonnes fréquemment requêtées | Requêtes plus rapides |

Ces améliorations ne sont pas implémentées car elles sont hors du périmètre du projet, mais elles démontrent une compréhension des stratégies de mise à l'échelle.

## Résumé des métriques clés

| Métrique | Ce qu'il faut observer |
|----------|----------------------|
| **RPS** (Requêtes Par Seconde) | Plus c'est élevé, mieux c'est. Montre la capacité de débit |
| **Latence p95** | 95e percentile du temps de réponse. Devrait rester sous 500ms |
| **Taux d'erreur** | Pourcentage de réponses non-2xx. Devrait rester sous 5% (hors 429 attendus) |
| **Scénarios terminés / lancés** | Devrait être proche de 100%. Si beaucoup échouent, le serveur est surchargé |
