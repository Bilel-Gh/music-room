# Choix technologiques — Music Room

Ce document explique chaque technologie utilisée dans le projet, pourquoi elle a été choisie par rapport aux alternatives, et ce qu'elle apporte concrètement.

---

## Express.js

**Ce que c'est** : Un framework web minimaliste pour Node.js qui gère le routage HTTP et les middlewares.

**Pourquoi Express plutôt que les alternatives** :
- **vs Fastify** : Express a un écosystème et une communauté beaucoup plus larges. Plus de tutoriels, plus de packages middleware, plus facile à débugger. Fastify est plus rapide mais Express est suffisamment performant pour notre échelle.
- **vs NestJS** : NestJS ajoute des abstractions lourdes (décorateurs, modules, conteneurs d'injection de dépendances) qui seraient du over-engineering pour ce projet. On n'a pas besoin d'un framework qui impose des patterns architecturaux — notre structure Routes → Contrôleurs → Services est suffisamment simple.
- **vs Hapi** : Moins populaire, communauté plus restreinte, moins d'options de middleware.

**Ce que ça apporte au projet** :
- Chaîne de middlewares simple : `cors → helmet → rate-limit → json → auth → routes → gestionnaire d'erreurs`
- Intégration facile avec Passport.js pour OAuth, Socket.io pour le temps réel, et swagger-ui pour la documentation
- Le backend entier tient en ~40 fichiers — Express reste discret

**Fichier clé** : `backend/src/app.ts` — Configuration Express avec tous les middlewares et routes.

---

## TypeScript

**Ce que c'est** : Un sur-ensemble de JavaScript qui ajoute des types statiques, vérifiés à la compilation.

**Pourquoi TypeScript plutôt que du JavaScript pur** :
- Détecte les bugs avant l'exécution : si on passe un `string` là où un `number` est attendu, TypeScript le signale immédiatement
- Autocomplétion dans l'IDE : quand on tape `user.`, on voit tous les champs disponibles
- Code auto-documenté : les types servent de documentation vivante qui ne devient jamais obsolète
- Prisma génère des types TypeScript depuis le schéma de la base de données, donc les requêtes sont typées

**Ce que ça apporte au projet** :
- Événements Socket.io typés (`ServerToClientEvents`, `ClientToServerEvents`) garantissent que le mobile et le backend s'accordent sur le format des événements
- Schémas Zod + types TypeScript donnent une double validation : runtime (Zod) + compilation (TS)
- Confiance partagée : si ça compile, les structures sont correctes

**Utilisé dans** : Backend et mobile (100% TypeScript, zéro fichier JavaScript).

---

## Prisma

**Ce que c'est** : Un ORM (Object-Relational Mapping) pour Node.js/TypeScript qui génère un client de base de données typé depuis un fichier de schéma.

**Pourquoi Prisma plutôt que les alternatives** :
- **vs SQL brut** : Le SQL brut est sujet aux erreurs (fautes de frappe, pas de vérification de types, risque d'injection SQL). Prisma génère des méthodes typées comme `prisma.user.findUnique({ where: { email } })`.
- **vs TypeORM** : TypeORM utilise des décorateurs et des modèles basés sur des classes, ce qui ajoute de la complexité. Prisma utilise un fichier de schéma simple (`schema.prisma`) comme source de vérité unique.
- **vs Sequelize** : Le support TypeScript de Sequelize a été ajouté après coup. Prisma a été conçu pour TypeScript dès le départ.
- **vs Knex** : Knex est un constructeur de requêtes, pas un ORM complet. Il faudrait définir les types manuellement.

**Ce que ça apporte au projet** :
- `prisma migrate dev` gère les migrations de base de données automatiquement
- `prisma.$transaction()` fournit des opérations atomiques pour les scénarios de votes/réordonnancement concurrents
- Types auto-générés : quand le schéma dit `name String`, le type TypeScript inclut `name: string`
- `@@unique([trackId, userId])` dans le schéma empêche les double votes au niveau de la base de données

**Fichiers clés** : `backend/prisma/schema.prisma` (schéma), `backend/src/lib/prisma.ts` (singleton du client).

---

## PostgreSQL (hébergé sur Supabase)

**Ce que c'est** : Une base de données relationnelle qui stocke toutes les données de l'application (utilisateurs, événements, playlists, votes...).

**Pourquoi PostgreSQL plutôt que les alternatives** :
- **vs MySQL** : PostgreSQL a un meilleur support pour les champs JSON, les UUID et les contraintes avancées. Meilleures performances pour les requêtes complexes.
- **vs MongoDB** : Nos données sont hautement relationnelles (les utilisateurs ont des événements, les événements ont des morceaux, les morceaux ont des votes). Une base de données relationnelle est le choix naturel. MongoDB nécessiterait des jointures manuelles et de la dénormalisation.
- **vs SQLite** : SQLite est basé sur des fichiers et ne supporte pas bien les écritures concurrentes. Pas adapté pour un backend multi-utilisateurs.

**Pourquoi Supabase comme hébergeur** :
- Offre gratuite avec une vraie base de données PostgreSQL (pas une base jouet)
- Fournit à la fois une URL avec pool de connexions (`DATABASE_URL`) et une URL directe (`DIRECT_URL`) pour les migrations Prisma
- **Important** : on utilise Supabase uniquement comme hébergeur de base de données. Pas de SDK Supabase, pas de Supabase Auth, pas de Supabase Realtime. Prisma se connecte directement à l'URL PostgreSQL.

---

## Socket.io

**Ce que c'est** : Une bibliothèque qui permet la communication bidirectionnelle en temps réel entre le backend et les clients mobiles via WebSockets.

**Pourquoi Socket.io plutôt que les alternatives** :
- **vs WebSockets bruts** : Socket.io ajoute la reconnexion automatique, la gestion des rooms et la messagerie par événements au-dessus des WebSockets. Avec des WS bruts, il faudrait implémenter tout cela manuellement.
- **vs Server-Sent Events (SSE)** : Les SSE sont unidirectionnels (serveur → client uniquement). On a besoin de communication bidirectionnelle pour `joinEvent`, `leaveEvent` etc.
- **vs Pusher/Ably** : Services tiers avec facturation à l'usage. Socket.io est gratuit et auto-hébergé.

**Ce que ça apporte au projet** :
- **Rooms** : `event:{id}`, `playlist:{id}`, `user:{id}` — envoyer les mises à jour uniquement aux utilisateurs concernés
- **Événements typés** : Les interfaces `ServerToClientEvents` et `ClientToServerEvents` assurent la sécurité des types
- **Reconnexion automatique** : si la connexion tombe (mobile en arrière-plan), Socket.io se reconnecte automatiquement
- **Fallback de transport** : essaie d'abord WebSocket, repasse en HTTP long-polling si nécessaire

**Fichiers clés** : `backend/src/config/socket.ts` (serveur), `mobile/src/services/socket.ts` (client).

---

## Zod

**Ce que c'est** : Une bibliothèque de validation de schémas conçue pour TypeScript, pour la validation des entrées à l'exécution.

**Pourquoi Zod plutôt que les alternatives** :
- **vs Joi** : Joi précède TypeScript et n'infère pas bien les types. Zod a été conçu pour TypeScript — quand on définit un schéma, on obtient le type TypeScript gratuitement avec `z.infer<typeof schema>`.
- **vs class-validator** : Nécessite des décorateurs et des classes. Zod fonctionne avec des objets simples.
- **vs express-validator** : API basée sur le chaînage, plus verbeux et plus difficile à typer.

**Ce que ça apporte au projet** :
- Chaque entrée API est validée avant d'atteindre le contrôleur : format d'email, longueur du mot de passe, format des UUID...
- La définition du schéma donne aussi le type TypeScript : `type RegisterInput = z.infer<typeof registerSchema>`
- Messages d'erreur structurés : `[{ field: "email", message: "Invalid email" }]`
- Prévient les attaques courantes : injection SQL (aucune chaîne brute n'atteint la BDD), confusion de types

**Fichiers clés** : dossier `backend/src/schemas/` (schémas auth, user, event, playlist).

---

## React Native (Expo)

**Ce que c'est** : Un framework pour construire des applications mobiles natives avec React et TypeScript. Expo est une boîte à outils par-dessus React Native qui simplifie la configuration.

**Pourquoi React Native plutôt que les alternatives** :
- **vs Flutter** : Le backend est déjà en TypeScript. Utiliser React Native signifie que toute la stack est en TypeScript — un seul langage, connaissances partagées, plus facile à maintenir.
- **vs Natif (Swift/Kotlin)** : Nécessiterait d'écrire l'application deux fois (iOS + Android). React Native produit une seule base de code pour les deux plateformes.
- **vs Ionic/Cordova** : Ce sont essentiellement des applications web enveloppées dans une WebView. React Native génère de vrais composants natifs — meilleures performances et apparence native.

**Pourquoi Expo spécifiquement** :
- Aucune configuration native nécessaire : pas besoin de configurer Xcode/Android Studio pour les fonctionnalités de base
- Accès intégré aux API de l'appareil : localisation (`expo-location`), sessions d'authentification (`expo-auth-session`), infos appareil (`expo-device`)
- La variable d'environnement `EXPO_PUBLIC_API_URL` rend la configuration du backend facile
- `npx expo start` lance le serveur de développement avec rechargement à chaud

**Fichiers clés** : `mobile/App.tsx` (point d'entrée), `mobile/src/navigation/AppNavigator.tsx` (arbre de navigation).

---

## Zustand

**Ce que c'est** : Une bibliothèque légère de gestion d'état pour React — plus simple que Redux, plus puissante que Context seul.

**Pourquoi Zustand plutôt que les alternatives** :
- **vs Redux** : Redux nécessite des actions, reducers, dispatch, middleware... trop de boilerplate pour nos besoins. Zustand se crée avec un seul appel de fonction.
- **vs React Context** : Context re-rend tous les consommateurs quand n'importe quelle valeur change. Zustand permet aux composants de s'abonner à des tranches spécifiques de l'état.
- **vs MobX** : MobX utilise des observables et des décorateurs. Zustand utilise des hooks simples — modèle mental plus simple.

**Ce que ça apporte au projet** :
- `useAuthStore` gère les tokens, le user ID, le statut premium et les persiste avec AsyncStorage
- `useNetworkStore` suit le statut en ligne/hors ligne pour le bonus mode hors ligne
- API simple : `useAuthStore.getState().accessToken` fonctionne à la fois dans et en dehors des composants React (important pour les intercepteurs Axios)

**Fichiers clés** : `mobile/src/store/authStore.ts`, `mobile/src/store/networkStore.ts`.

---

## Autres outils

| Outil | Objectif | Pourquoi |
|-------|----------|----------|
| **bcrypt** | Hashage des mots de passe | Standard de l'industrie, 10 tours de sel, résistant aux attaques temporelles |
| **jsonwebtoken** | Création/vérification de JWT | La bibliothèque Node.js standard pour les JWT |
| **Passport.js** | Google OAuth | Gère la danse OAuth (redirections, callbacks, échange de tokens) |
| **helmet** | Headers de sécurité HTTP | Ajoute CSP, HSTS, X-Frame-Options etc. en une ligne |
| **cors** | Cross-Origin Resource Sharing | Permet à l'application mobile d'appeler l'API backend |
| **express-rate-limit** | Limitation de débit | Empêche les attaques par force brute sur login/register |
| **winston** | Logging structuré | Sortie fichier + console avec horodatage, rotation, métadonnées |
| **swagger-jsdoc + swagger-ui-express** | Documentation API | Génère automatiquement une doc interactive depuis les annotations des routes |
| **vitest + supertest** | Tests | Runner de tests rapide + assertions HTTP pour les tests API |
| **Artillery** | Tests de charge | Simule des utilisateurs concurrents pour trouver les limites de performance |
