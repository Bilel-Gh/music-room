# Questions / Reponses — Soutenance Music Room

Les reponses sont formulees pour etre dites a l'oral. Elles font reference au code reel du projet.

---

## 1. Pouvez-vous nous presenter l'architecture globale du projet ?

Le projet est decoupe en trois parties. L'application mobile est en React Native avec Expo, elle communique avec un backend Express en TypeScript par deux canaux : des requetes HTTP classiques pour les actions (creer, modifier, supprimer) et une connexion WebSocket via Socket.io pour le temps reel (recevoir les mises a jour instantanement). Le backend parle a une base PostgreSQL hebergee sur Supabase a travers Prisma, qui est notre ORM. On utilise Supabase uniquement comme hebergeur de base de donnees, on n'utilise aucun SDK Supabase. Tout passe par Prisma qui se connecte directement a la base via l'URL PostgreSQL.

---

## 2. Pourquoi avoir choisi Express plutot qu'un framework plus structure comme NestJS ?

NestJS impose des patterns assez lourds : decorateurs, modules, injection de dependances, tout un systeme d'architecture. Pour notre projet, c'etait clairement du over-engineering. On a une structure simple : Routes, Controllers, Services, et ca suffit largement. Express nous laisse cette liberte. En plus, l'ecosysteme Express est enorme : Passport pour OAuth, helmet pour la securite, swagger-ui pour la doc... tout s'integre facilement. Notre fichier `app.ts` fait 42 lignes, c'est lisible et maintenable.

---

## 3. Pourquoi Prisma plutot que du SQL brut ou TypeORM ?

Prisma genere des types TypeScript directement depuis le schema de la base. Quand j'ecris `prisma.user.findUnique({ where: { email } })`, j'ai l'autocompletion sur tous les champs, et si je fais une faute TypeScript me le dit a la compilation. Avec du SQL brut, j'aurais des risques de typos dans les requetes, pas de type safety, et un risque d'injection SQL. TypeORM utilise des decorateurs et des classes, c'est plus verbeux. Prisma a un fichier `schema.prisma` qui est la source de verite unique pour toute la base — les tables, les relations, les contraintes — et les migrations se font avec `prisma migrate dev`.

---

## 4. Comment fonctionne l'authentification JWT dans votre projet ?

Quand un utilisateur se connecte, le backend verifie son mot de passe avec bcrypt, puis genere deux tokens JWT. L'access token dure 15 minutes, le refresh token 7 jours. L'access token est envoye a chaque requete dans le header `Authorization: Bearer`. Le middleware `auth.middleware.ts` extrait le token, verifie la signature avec `jwt.verify()` et attache les infos utilisateur a `req.user`. Quand l'access token expire, le mobile detecte le 401 grace a un intercepteur Axios, envoie automatiquement le refresh token a `/api/auth/refresh`, recoit une nouvelle paire de tokens, et retente la requete originale. L'utilisateur ne voit rien, c'est transparent.

---

## 5. Pourquoi deux tokens au lieu d'un seul ?

C'est une question de securite. L'access token est envoye a chaque requete, donc il est plus expose. S'il est vole, l'attaquant n'a que 15 minutes pour l'utiliser. Le refresh token, lui, n'est envoye que quand il faut renouveler l'access token, donc il est beaucoup moins expose. Et il dure 7 jours pour que l'utilisateur n'ait pas a se reconnecter toutes les 15 minutes. Les deux tokens utilisent des secrets differents : `JWT_SECRET` et `JWT_REFRESH_SECRET`.

---

## 6. Comment fonctionne le flow OAuth Google sur mobile ?

Le mobile ouvre un navigateur integre avec `expo-auth-session` qui affiche la page de connexion Google. L'utilisateur entre ses identifiants Google — on ne les voit jamais. Google renvoie un ID token au mobile. Le mobile envoie cet ID token au backend via `POST /api/auth/google/mobile`. Le backend appelle l'API Google `oauth2.googleapis.com/tokeninfo` pour verifier que le token est valide et que l'audience correspond bien a notre client ID. Ensuite il cherche l'utilisateur en base : soit par Google ID, soit par email. Si l'email existe deja sans Google lie, il fait le lien. Si c'est un nouvel utilisateur, il cree le compte. Dans tous les cas, il genere des tokens JWT et les renvoie au mobile.

---

## 7. Comment gerez-vous la concurrence sur les votes ?

C'est le point critique. Quand deux utilisateurs votent en meme temps sur le meme track, il y a un risque de race condition sur le compteur `voteCount`. On resout ca avec une transaction Prisma dans `vote.service.ts`. Toute l'operation — verifier si le vote existe, creer ou supprimer le vote, mettre a jour le compteur — se fait dans un seul `prisma.$transaction()`. Et surtout, on utilise `{ increment: 1 }` et `{ decrement: 1 }` au lieu de lire la valeur, l'incrementer en JS et la reecrire. Ca se traduit en SQL par `SET voteCount = voteCount + 1`, qui est atomique au niveau PostgreSQL. Meme si deux transactions tournent en parallele, les deux increments sont bien appliques.

---

## 8. Et la concurrence sur le reordonnancement des playlists ?

Meme principe, avec des transactions Prisma. Quand on deplace un track de la position 1 a la position 3, il faut decaler toutes les positions intermediaires. Tout ca se fait dans un `$transaction()` dans `playlist.service.ts`. On lit la position actuelle, on calcule quels tracks doivent etre decales, on applique les decrements ou increments avec `updateMany`, puis on met a jour la position du track deplace. Si deux utilisateurs reordonnent en meme temps, les transactions s'executent l'une apres l'autre grace a l'isolation de PostgreSQL. Pareil pour l'ajout : on lit la position max dans la transaction pour eviter que deux ajouts simultanes aient la meme position.

---

## 9. Comment fonctionne le temps reel avec Socket.io ?

Socket.io maintient une connexion WebSocket permanente entre le mobile et le backend. Le concept cle, c'est les rooms. Quand un utilisateur ouvre l'ecran d'un evenement, le mobile emet `joinEvent` avec l'ID de l'evenement, et Socket.io ajoute ce client a la room `event:{eventId}`. Quand quelqu'un vote, le controller appelle le service, met a jour la base, puis recupere la liste des tracks mise a jour et l'emet avec `io.to('event:{eventId}').emit('trackVoted', { tracks })`. Tous les clients dans cette room recoivent instantanement la nouvelle liste. Quand l'utilisateur quitte l'ecran, on emet `leaveEvent` pour sortir de la room.

---

## 10. Pourquoi Socket.io plutot que des Server-Sent Events ou du polling ?

Le polling, c'est envoyer des requetes toutes les X secondes pour verifier s'il y a du nouveau — c'est du gaspillage de bande passante et de ressources. Les Server-Sent Events sont unidirectionnels : le serveur peut envoyer des donnees, mais le client ne peut pas repondre. Nous on a besoin de bidirectionnel : le client emet `joinEvent`, `leaveEvent`, `authenticate` vers le serveur. Socket.io offre tout ca, plus la gestion des rooms, la reconnexion automatique, et le fallback vers le long-polling si le WebSocket n'est pas disponible. En plus, nos events sont types avec des interfaces TypeScript, ce qui evite les bugs silencieux.

---

## 11. Quelles mesures de securite avez-vous mises en place ?

On a plusieurs couches. D'abord helmet qui ajoute des headers HTTP de securite en une ligne — protection XSS, clickjacking, MIME sniffing. Ensuite le rate limiting : 200 requetes par 15 minutes sur toute l'API, et seulement 5 sur les routes d'auth comme login et register, pour bloquer le brute-force. Les mots de passe sont hashes avec bcrypt a 10 rounds. Toutes les entrees sont validees avec Zod — email, longueur du mot de passe, format des UUID. Prisma utilise des requetes parametrees donc l'injection SQL est impossible. Et chaque requete est loggee avec Winston : methode, URL, user ID, plateforme, appareil, version de l'app.

---

## 12. Comment validez-vous les entrees utilisateur ?

Avec Zod. Chaque route a un schema de validation. Par exemple, pour l'inscription, le schema exige un email valide, un mot de passe d'au moins 8 caracteres, et un nom d'au moins 2 caracteres. Le middleware `validate.middleware.ts` appelle `schema.safeParse(req.body)`. Si ca echoue, on renvoie un 400 avec la liste des erreurs structurees : champ par champ, avec un message explicatif. Si ca passe, les donnees validees remplacent `req.body` pour le controller. Ca se fait avant meme que le code metier ne soit touche.

---

## 13. Pourquoi PostgreSQL plutot que MongoDB ?

Nos donnees sont fortement relationnelles. Un utilisateur cree des evenements, les evenements contiennent des tracks, les tracks ont des votes, les votes sont lies aux utilisateurs. C'est un schema classique avec des cles etrangeres et des contraintes d'unicite. PostgreSQL est fait pour ca. Avec MongoDB, on aurait du gerer les relations manuellement avec des lookups, et on n'aurait pas les contraintes d'integrite au niveau de la base. Par exemple, notre contrainte `@@unique([trackId, userId])` qui empeche un double vote, c'est natif en PostgreSQL. En MongoDB, il faudrait le gerer au niveau applicatif, ce qui est moins fiable.

---

## 14. Comment est structuree votre base de donnees ?

On a 8 tables principales. `User` stocke l'authentification et le profil avec trois niveaux de visibilite. `Friendship` gere les relations d'amitie avec un statut PENDING ou ACCEPTED. `Event` represente un evenement musical avec un type de licence : OPEN, INVITE_ONLY ou LOCATION_TIME. `Track` contient les morceaux ajoutes a un evenement avec un compteur de votes denormalise. `Vote` enregistre les votes avec une contrainte d'unicite pour eviter les doublons. `EventMember` lie les utilisateurs aux evenements avec un role. Et cote playlists, on a `Playlist`, `PlaylistTrack` avec un champ position pour l'ordre, et `PlaylistMember` avec un flag `canEdit` pour les permissions.

---

## 15. Pourquoi avoir denormalise le champ voteCount sur Track ?

Sans ce champ, a chaque fois qu'on affiche la liste des tracks d'un evenement, il faudrait faire un `COUNT(*)` sur la table `Vote` pour chaque track. Avec 50 tracks et 100 utilisateurs connectes qui rafraichissent, ca fait beaucoup de requetes. Le `voteCount` evite ca : on lit directement le compteur. Le risque de la denormalisation, c'est que la valeur se desynchronise, mais on gere ca avec des transactions Prisma et des `increment`/`decrement` atomiques. Le compteur est toujours mis a jour en meme temps que le vote dans la meme transaction.

---

## 16. Comment fonctionne le systeme de visibilite des profils ?

Le modele `User` a trois champs de profil : `publicInfo`, `friendsInfo`, et `privateInfo`. Quand on consulte le profil d'un autre utilisateur, le service `getUserProfile` dans `user.service.ts` verifie d'abord si c'est son propre profil — auquel cas tout est visible. Sinon, il verifie si les deux sont amis en cherchant une Friendship avec statut ACCEPTED. Si oui, il renvoie `publicInfo` et `friendsInfo`. Si non, seulement `publicInfo`. Le champ `privateInfo` n'est jamais visible par les autres, meme les amis.

---

## 17. Comment fonctionne le systeme de licences des evenements ?

On a trois types de licence. OPEN : n'importe qui peut rejoindre, ajouter des tracks et voter. INVITE_ONLY : il faut etre invite par le createur, le service verifie qu'on est membre avant chaque action. Et LOCATION_TIME : en plus de la verification de membership, on verifie que l'utilisateur est dans un rayon de 5 km de l'evenement grace a la formule de Haversine, et qu'on est dans la fenetre temporelle entre `startTime` et `endTime`. Si l'utilisateur est trop loin ou en dehors du creneau, il recoit un 403.

---

## 18. Pourquoi React Native et pas Flutter ou du natif ?

Tout notre stack est en TypeScript : le backend et le mobile. Ca veut dire un seul langage pour tout le projet, des connaissances partagees, pas besoin de switcher de syntaxe. Flutter utilise Dart, donc ca aurait ajoute un second langage. Le natif en Swift et Kotlin aurait demande deux codebases separees pour iOS et Android. Avec React Native et Expo, on a un seul code qui tourne partout. Expo simplifie aussi l'acces aux APIs natives comme la geolocalisation, l'authentification Google et les infos du device, sans toucher a Xcode ou Android Studio.

---

## 19. Comment gerez-vous les erreurs dans l'API ?

On a un middleware d'erreurs centralise dans `error.middleware.ts`. Toutes les erreurs remontent via `next(err)` dans les controllers. Les erreurs metier ont un champ `status` attache : 404 pour "not found", 403 pour "forbidden", 409 pour les conflits. Le middleware lit ce status, et si c'est un 500, il log l'erreur complete en console mais renvoie un message generique "Internal server error" au client — pour ne pas exposer les details internes. Toutes les reponses d'erreur suivent le meme format : `{ success: false, error: "message" }`.

---

## 20. Comment fonctionne le state management cote mobile ?

On utilise Zustand. C'est plus simple que Redux : pas de reducers, pas de dispatch, pas de provider a wrapper. Le store principal, `authStore`, garde les tokens JWT, le user ID, et le statut premium en memoire. Quand on appelle `setTokens()`, ca persiste aussi dans AsyncStorage pour survivre a la fermeture de l'app. Au demarrage, `loadTokens()` restaure les tokens depuis AsyncStorage. Un point important : on peut acceder au store en dehors des composants React avec `useAuthStore.getState()`, ce qu'on fait dans les intercepteurs Axios pour ajouter le token a chaque requete et dans le client Socket.io pour s'authentifier.
