# Gestion de la concurrence — Music Room

C'est l'aspect technique le plus critique du projet. Quand plusieurs utilisateurs interagissent avec le même événement ou la même playlist simultanément, les données peuvent devenir incohérentes si ce n'est pas géré correctement.

## Qu'est-ce que la concurrence dans ce projet ?

La concurrence signifie que plusieurs utilisateurs effectuent des actions en même temps sur les mêmes données. Dans Music Room, cela se produit dans deux scénarios principaux :

1. **Votes simultanés** : Deux utilisateurs votent sur le même morceau au même instant
2. **Éditions simultanées de playlist** : Deux utilisateurs ajoutent/suppriment/réordonnent des morceaux dans la même playlist au même instant

Sans gestion appropriée, ces scénarios peuvent corrompre les données.

## Problème 1 : Condition de course sur les votes

### Le problème

Le système de vote utilise un **toggle** : voter à nouveau supprime le vote. La table `Track` a un champ `voteCount` qui met en cache le nombre total de votes.

Voici ce qui pourrait mal se passer SANS transaction :

```
Temps   Utilisateur A               Utilisateur B               Base de données
─────   ─────────────────────       ─────────────────────       ──────────────
                                                                voteCount = 5
T1      Lire voteCount → 5
T2                                  Lire voteCount → 5
T3      Ajouter le vote
T4      Écrire voteCount = 6                                    voteCount = 6
T5                                  Ajouter le vote
T6                                  Écrire voteCount = 6        voteCount = 6
                                                                ← FAUX ! Devrait être 7
```

Les deux utilisateurs lisent `voteCount = 5`, les deux calculent `5 + 1 = 6`, et les deux écrivent `6`. On a perdu le vote de l'utilisateur B.

### La solution : Transactions Prisma avec opérations atomiques

**Fichier** : `backend/src/services/vote.service.ts:67-91`

```typescript
const result = await prisma.$transaction(async (tx) => {
  // Étape 1 : Vérifier si le vote existe (dans la transaction = lecture isolée)
  const existingVote = await tx.vote.findUnique({
    where: { trackId_userId: { trackId, userId } },
  });

  if (existingVote) {
    // Retirer le vote : supprimer le vote + DÉCRÉMENTER (atomique)
    await tx.vote.delete({ where: { id: existingVote.id } });
    const updatedTrack = await tx.track.update({
      where: { id: trackId },
      data: { voteCount: { decrement: 1 } },  // ← décrémentation atomique
    });
    return { track: updatedTrack, voted: false };
  }

  // Voter : créer le vote + INCRÉMENTER (atomique)
  await tx.vote.create({ data: { trackId, userId } });
  const updatedTrack = await tx.track.update({
    where: { id: trackId },
    data: { voteCount: { increment: 1 } },  // ← incrémentation atomique
  });
  return { track: updatedTrack, voted: true };
});
```

**Comment cela résout le problème** :

1. **`prisma.$transaction()`** : Toutes les opérations dans le callback se font de manière atomique — si une étape échoue, tout est annulé. Pas de mises à jour partielles.

2. **`{ increment: 1 }` / `{ decrement: 1 }`** : Au lieu de lire la valeur actuelle, calculer `valeur + 1` et la réécrire (lecture-modification-écriture), Prisma envoie `UPDATE track SET voteCount = voteCount + 1` directement à PostgreSQL. C'est **atomique au niveau de la base de données** : PostgreSQL garantit que deux incrémentations concurrentes seront toutes les deux appliquées correctement.

Avec cette approche, le même scénario devient :

```
Temps   Utilisateur A               Utilisateur B               Base de données
─────   ─────────────────────       ─────────────────────       ──────────────
                                                                voteCount = 5
T1      DÉBUT TRANSACTION
T2      Vérifier vote → n'existe pas
T3                                  DÉBUT TRANSACTION
T4      Créer le vote
T5      INCRÉMENTER voteCount                                   voteCount = 6
T6      COMMIT
T7                                  Vérifier vote → n'existe pas
T8                                  Créer le vote
T9                                  INCRÉMENTER voteCount       voteCount = 7 ✓
T10                                 COMMIT
```

### Sécurité supplémentaire : contrainte d'unicité

**Fichier** : `backend/prisma/schema.prisma:122`

```prisma
@@unique([trackId, userId])
```

Même si par miracle deux créations de vote identiques passaient, la base de données elle-même rejette le doublon avec une violation de contrainte d'unicité. C'est un filet de sécurité — il ne devrait jamais se déclencher en fonctionnement normal, mais il garantit l'intégrité des données.

## Problème 2 : Condition de course sur les positions de playlist

### Le problème

Les morceaux de playlist ont un champ `position` (0, 1, 2, 3...) qui détermine leur ordre. Quand quelqu'un réordonne un morceau, les autres positions doivent se décaler. Deux utilisateurs qui réordonnent en même temps peuvent créer des trous ou des doublons dans les positions.

Exemple SANS transaction — L'utilisateur A déplace un morceau de la position 0 à la position 2, l'utilisateur B déplace un morceau de la position 1 à la position 0 :

```
Avant :  [Morceau A : pos 0] [Morceau B : pos 1] [Morceau C : pos 2]

Utilisateur A (déplacer A : 0→2) :   Utilisateur B (déplacer B : 1→0) :
  Lire positions : 0,1,2              Lire positions : 0,1,2
  Décaler B,C vers le bas             Décaler A vers le haut
  Mettre A à 2                        Mettre B à 0

Après (CORROMPU) :  Les deux peuvent écrire des positions conflictuelles
                    [Morceau B : pos 0] [Morceau A : pos 0] [Morceau C : pos 2]  ← POSITION 0 EN DOUBLE !
```

### La solution : Transactions Prisma avec décalages séquentiels

**Fichier** : `backend/src/services/playlist.service.ts:176-218`

```typescript
export async function reorderTrack(playlistId, trackId, newPosition, userId) {
  await assertCanEdit(playlistId, userId);

  return prisma.$transaction(async (tx) => {
    // Étape 1 : Obtenir la position actuelle du morceau
    const track = await tx.playlistTrack.findUnique({ where: { id: trackId } });
    const oldPosition = track.position;
    if (oldPosition === newPosition) return;  // Rien à faire

    // Étape 2 : Limiter à la plage valide
    const trackCount = await tx.playlistTrack.count({ where: { playlistId } });
    const clampedNew = Math.min(newPosition, trackCount - 1);

    // Étape 3 : Décaler les morceaux affectés
    if (oldPosition < clampedNew) {
      // Déplacement VERS LE BAS : décaler les morceaux entre ancien+1 et nouveau VERS LE HAUT de -1
      await tx.playlistTrack.updateMany({
        where: {
          playlistId,
          position: { gt: oldPosition, lte: clampedNew },
        },
        data: { position: { decrement: 1 } },
      });
    } else {
      // Déplacement VERS LE HAUT : décaler les morceaux entre nouveau et ancien-1 VERS LE BAS de +1
      await tx.playlistTrack.updateMany({
        where: {
          playlistId,
          position: { gte: clampedNew, lt: oldPosition },
        },
        data: { position: { increment: 1 } },
      });
    }

    // Étape 4 : Placer le morceau à sa nouvelle position
    await tx.playlistTrack.update({
      where: { id: trackId },
      data: { position: clampedNew },
    });
  });
}
```

**Comment cela résout le problème** :

L'opération entière (lire les positions, décaler les morceaux intermédiaires, déplacer la cible) se fait dans une seule `$transaction()`. PostgreSQL garantit que :
- Aucune autre transaction ne peut modifier les mêmes lignes pendant que celle-ci s'exécute
- Si une étape échoue, toutes les modifications sont annulées
- Les positions sont toujours contiguës (0, 1, 2, 3...) sans trous ni doublons

### Même approche pour l'ajout et la suppression

**Ajout d'un morceau** (`backend/src/services/playlist.service.ts:135-154`) :
```typescript
return prisma.$transaction(async (tx) => {
  // Trouver la position maximale actuelle
  const lastTrack = await tx.playlistTrack.findFirst({
    where: { playlistId },
    orderBy: { position: 'desc' },
  });
  const nextPosition = lastTrack ? lastTrack.position + 1 : 0;

  return tx.playlistTrack.create({
    data: { ...data, playlistId, addedById: userId, position: nextPosition },
  });
});
```

Sans transaction, deux ajouts simultanés pourraient lire la même `lastTrack.position`, calculer la même `nextPosition`, et créer deux morceaux avec la même position.

**Suppression d'un morceau** (`backend/src/services/playlist.service.ts:157-173`) :
```typescript
return prisma.$transaction(async (tx) => {
  const track = await tx.playlistTrack.findUnique({ where: { id: trackId } });

  await tx.playlistTrack.delete({ where: { id: trackId } });

  // Décaler tous les morceaux après celui supprimé
  await tx.playlistTrack.updateMany({
    where: { playlistId, position: { gt: track.position } },
    data: { position: { decrement: 1 } },
  });
});
```

Après la suppression, tous les morceaux avec une position supérieure sont décalés de 1 vers le bas pour combler le trou. Cela maintient des positions contiguës.

## Problème 3 : Contrôle d'accès LOCATION_TIME

### Le problème

Pour les événements `LOCATION_TIME`, les utilisateurs doivent être dans un rayon de 5 km de l'événement ET dans la fenêtre temporelle pour voter ou ajouter des morceaux. Sans vérifications appropriées, un utilisateur pourrait :
- Voter avant le début de l'événement
- Voter après la fin de l'événement
- Voter depuis une autre ville

### La solution : Formule de Haversine + vérification de la fenêtre temporelle

**Fichier** : `backend/src/services/vote.service.ts:4-13` et `backend/src/services/vote.service.ts:44-63`

```typescript
// Formule de Haversine : distance entre deux points GPS
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const MAX_DISTANCE_KM = 5;
```

Avant d'autoriser un vote sur un événement LOCATION_TIME, le service vérifie :

1. **Vérification temporelle** : L'heure actuelle est-elle entre `event.startTime` et `event.endTime` ?
2. **Vérification de localisation** : La position GPS de l'utilisateur est-elle dans un rayon de 5 km des coordonnées de l'événement ?
3. **Localisation requise** : Si l'événement a des coordonnées, l'utilisateur DOIT fournir ses propres coordonnées

Les mêmes vérifications sont appliquées pour l'ajout de morceaux aux événements LOCATION_TIME (`backend/src/services/event.service.ts:223-240`).

## Résumé de toutes les protections contre la concurrence

| Opération | Problème | Solution | Fichier:Lignes |
|-----------|----------|----------|----------------|
| Vote sur un morceau | Votes perdus (course lecture-modification-écriture) | `$transaction` + `increment/decrement` atomique | `vote.service.ts:67-91` |
| Double vote | Le même utilisateur vote deux fois simultanément | Contrainte `@@unique([trackId, userId])` | `schema.prisma:122` |
| Ajout de morceau à playlist | Deux morceaux obtiennent la même position | `$transaction` lit la position max + crée | `playlist.service.ts:139-154` |
| Suppression de morceau de playlist | Trou dans les positions après suppression | `$transaction` supprime + décale les restants | `playlist.service.ts:160-173` |
| Réordonnancement de morceau de playlist | Chevauchement des décalages de position | `$transaction` avec logique de décalage séquentiel | `playlist.service.ts:184-218` |
| Double adhésion à un événement | Le même utilisateur rejoint deux fois | Contrainte `@@unique([eventId, userId])` | `schema.prisma:136` |
| Double membre de playlist | Le même utilisateur invité deux fois | Contrainte `@@unique([playlistId, userId])` | `schema.prisma:187` |
| Contournement LOCATION_TIME | Vote depuis le mauvais endroit/moment | Vérification de distance Haversine + fenêtre temporelle | `vote.service.ts:44-63` |

## Pourquoi les transactions Prisma sont suffisantes

Le `$transaction()` de Prisma avec le pattern de callback interactif correspond au `BEGIN...COMMIT` de PostgreSQL avec le niveau d'isolation `READ COMMITTED`. Cela signifie :

- Chaque instruction dans la transaction voit les dernières données committées
- Si deux transactions tentent de modifier la même ligne, l'une attend que l'autre finisse
- Les opérations `increment`/`decrement` se compilent en `SET column = column + 1` qui est atomique au niveau SQL

Pour notre cas d'usage (une application musicale, pas un système bancaire), cela fournit une protection suffisante sans la surcharge de l'isolation `SERIALIZABLE` ou du verrouillage explicite de lignes (`SELECT FOR UPDATE`).
