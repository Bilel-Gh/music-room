# Gestion de la concurrence — Music Room

## C'est quoi le problème ?

Imagine que tu as un bouton "voter pour cette chanson". Deux utilisateurs appuient dessus **exactement en même temps**. Que se passe-t-il côté serveur ?

Sans protection, les deux requêtes arrivent simultanément. Elles lisent toutes les deux le compteur de votes, disons `5`. Elles font chacune `5 + 1 = 6`, et écrivent `6`. Résultat : deux votes enregistrés, mais le compteur n'a augmenté que de 1. Un vote est **perdu**.

C'est ce qu'on appelle une **race condition** (condition de course) : deux opérations se "courent dessus" et se marchent dessus.

---

## La solution : les transactions

Une **transaction** c'est comme une "zone protégée" dans la base de données. On dit à la base : "exécute ces opérations ensemble, et garantis-moi qu'elles s'exécutent comme si personne d'autre n'existait pendant ce temps-là."

En pratique avec Prisma, ça ressemble à ça :

```ts
await prisma.$transaction(async (tx) => {
  // Tout ce qui est ici est atomique
  const vote = await tx.vote.findUnique(...)
  await tx.vote.create(...)
  await tx.track.update({ data: { voteCount: { increment: 1 } } })
});
```

Le mot clé c'est **atomique** : soit tout s'exécute, soit rien. Pas de moitié.

---

## Service 1 : Les votes sur les tracks

**Fichier concerné :** `backend/src/services/vote.service.ts`

### Ce qui se passe quand tu votes

```
Utilisateur A vote ──────────────────────────────────────┐
                                                          │ Transaction A
                     1. Existe un vote ? → Non            │
                     2. Crée le vote                      │
                     3. voteCount + 1                     │
                                                          ┘

Utilisateur B vote (un peu après) ───────────────────────┐
                                                          │ Transaction B
                     1. Existe un vote ? → Non            │
                     2. Crée le vote                      │
                     3. voteCount + 1                     │
                                                          ┘
```

### Pourquoi ça ne peut pas bugger ?

**Raison 1 — La transaction.**
Le check "est-ce que ce vote existe déjà ?" et le "créer le vote + incrémenter le compteur" se font d'un seul bloc. Personne ne peut s'intercaler au milieu.

**Raison 2 — La contrainte unique en base.**
Dans le schéma Prisma, le modèle `Vote` a :
```prisma
@@unique([trackId, userId])
```
Traduction : la base de données **interdit physiquement** qu'un même utilisateur vote deux fois pour la même track. Même si deux requêtes identiques arrivent simultanément, la deuxième se prendra une erreur de la base avant même d'écrire quoi que ce soit.

**Raison 3 — L'incrément relatif.**
Au lieu d'écrire `voteCount = 6`, Prisma écrit `voteCount = voteCount + 1`. C'est la base de données elle-même qui fait le calcul, avec la valeur **actuelle** au moment de l'écriture. Donc même si deux transactions lisent `5` en même temps, les deux incréments s'appliquent correctement et le résultat final sera `7`.

### Le système de toggle (vote / dévote)

Le service gère aussi le "dévote" (re-cliquer sur un vote pour l'annuler). La logique est dans la transaction :

1. Cherche si un vote existe pour (trackId, userId)
2. **Si oui** → supprime le vote, décrémente le compteur → retourne `voted: false`
3. **Si non** → crée le vote, incrémente le compteur → retourne `voted: true`

Tout ça dans une seule transaction, donc pas de risque de se retrouver avec un vote créé mais le compteur pas mis à jour.

---

## Service 2 : Les playlists collaboratives

**Fichier concerné :** `backend/src/services/playlist.service.ts`

Les playlists ont un problème de concurrence différent : les **positions**. Chaque track a une position (`0, 1, 2, 3...`) qui détermine l'ordre d'écoute. Deux utilisateurs qui modifient la playlist en même temps peuvent créer un désordre.

### Ajouter une track (`addTrack`)

```ts
return prisma.$transaction(async (tx) => {
  const lastTrack = await tx.playlistTrack.findFirst({
    where: { playlistId },
    orderBy: { position: 'desc' },
  });
  const nextPosition = lastTrack ? lastTrack.position + 1 : 0;

  return tx.playlistTrack.create({ data: { ...data, position: nextPosition } });
});
```

**Le problème possible :** Si Alice et Bob ajoutent une track au même moment, ils lisent tous les deux la même "dernière position" (disons 4). Ils essaient tous les deux de créer une track en position 5. Résultat : deux tracks en position 5.

**Ce que la transaction garantit ici :** l'opération "lire la dernière position + créer la track" est atomique. Dans la majorité des cas, l'une des deux transactions passera avant l'autre, et la deuxième lira la bonne valeur.

> **Limite connue :** Sur un pic de charge extrême avec des requêtes quasi-simultanées, deux tracks pourraient se retrouver à la même position. Ce n'est pas bloquant pour l'utilisateur (les tracks s'affichent quand même), et c'est un compromis acceptable pour un projet à ce niveau.

### Supprimer une track (`removeTrack`)

Quand on supprime une track en position 2, toutes celles en position 3, 4, 5... doivent descendre d'un cran. C'est fait dans une transaction :

```ts
await tx.playlistTrack.delete({ where: { id: trackId } });

// Décale tout ce qui était après
await tx.playlistTrack.updateMany({
  where: { playlistId, position: { gt: track.position } },
  data: { position: { decrement: 1 } },
});
```

Sans transaction, quelqu'un pourrait lire la liste entre la suppression et le décalage et voir des positions incohérentes.

### Réordonner une track (`reorderTrack`)

C'est l'opération la plus complexe. Déplacer une track de la position 1 à la position 4 nécessite de décaler toutes les tracks entre les deux positions. La logique gère les deux sens :

- **Déplacer vers le bas** (1 → 4) : les tracks en positions 2, 3, 4 montent d'un cran (position - 1)
- **Déplacer vers le haut** (4 → 1) : les tracks en positions 1, 2, 3 descendent d'un cran (position + 1)

Tout ça dans une transaction pour éviter qu'un lecteur voie la playlist dans un état intermédiaire.

---

## Les contraintes uniques comme dernier filet de sécurité

En dehors des transactions, le schéma Prisma définit des contraintes qui bloquent les doublons **directement en base** :

| Modèle | Contrainte | Effet |
|---|---|---|
| `Vote` | `@@unique([trackId, userId])` | Impossible de voter deux fois pour la même track |
| `EventMember` | `@@unique([eventId, userId])` | Impossible de rejoindre un événement deux fois |
| `PlaylistMember` | `@@unique([playlistId, userId])` | Impossible d'être membre deux fois d'une playlist |
| `Friendship` | `@@unique([userId, friendId])` | Impossible d'envoyer deux demandes d'amitié |

Ces contraintes sont le dernier rempart. Même si une transaction rate ou qu'une vérification applicative est contournée, la base de données refusera l'insertion et renverra une erreur.

---

## Ce qu'on n'a pas fait (et pourquoi c'est ok)

### Verrouillage pessimiste (`SELECT FOR UPDATE`)

C'est une technique qui consiste à "verrouiller" une ligne dès qu'on la lit, pour empêcher toute autre transaction de la modifier pendant ce temps. Plus sûr, mais plus lent et complexe à gérer. Pour un projet à cette échelle, ce n'est pas nécessaire.

### Optimistic locking (version number)

Ajouter un champ `version` sur chaque enregistrement, et vérifier que la version n'a pas changé avant d'écrire. Si c'est le cas, on rejette la modification et on demande à l'utilisateur de réessayer. Utile pour des systèmes très concurrentiels. Pas justifié ici.

### Queue de traitement (message queue)

Mettre tous les votes dans une file d'attente et les traiter un par un. Garantit l'ordre mais ajoute une complexité d'infrastructure (Redis, BullMQ...) totalement disproportionnée pour ce projet.

---

## Résumé

| Mécanisme | Où | Ce que ça protège |
|---|---|---|
| `prisma.$transaction` | vote, add/remove/reorder track | Opérations lecture + écriture atomiques |
| `{ increment: 1 }` (relatif) | compteur de votes | Incréments corrects même sous charge |
| `@@unique` en base | Vote, Member, Friendship | Doublons impossibles, dernier filet de sécurité |
| Vérification applicative | Partout | Erreurs métier claires avant d'arriver en base |

Le niveau de protection est adapté à la charge attendue du projet. Les transactions Prisma couplées aux contraintes uniques PostgreSQL couvrent les cas de concurrence réalistes sans sur-complexifier le code.
