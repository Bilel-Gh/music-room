# Phase 8 — Application Mobile (React Native / Expo)

Ce document decrit la mise en place de l'application mobile Music Room, construite avec **React Native**, **Expo** et **TypeScript**.

---

## Stack technique

| Element | Technologie |
|---------|-------------|
| Framework | React Native (Expo SDK 55) |
| Langage | TypeScript (strict mode) |
| Navigation | React Navigation v7 (Native Stack) |
| State management | Zustand v5 |
| Persistance locale | AsyncStorage |
| HTTP client | Axios (avec intercepteurs JWT) |
| Temps reel | Socket.io Client |

---

## Structure du projet

```
mobile/
├── App.tsx                          # Point d'entree, monte le navigateur
├── .env                             # URL du backend (configurable)
├── src/
│   ├── navigation/
│   │   └── AppNavigator.tsx         # Arbre de navigation conditionnel
│   ├── screens/
│   │   ├── LoginScreen.tsx          # Ecran de connexion
│   │   ├── RegisterScreen.tsx       # Ecran d'inscription
│   │   ├── HomeScreen.tsx           # Ecran principal (liste events/playlists)
│   │   ├── EventScreen.tsx          # Detail d'un evenement + vote
│   │   ├── PlaylistScreen.tsx       # Detail d'une playlist + edition
│   │   └── ProfileScreen.tsx        # Profil utilisateur
│   ├── store/
│   │   └── authStore.ts             # Store Zustand (tokens JWT)
│   └── services/
│       ├── api.ts                   # Instance Axios avec intercepteurs
│       └── socket.ts                # Client Socket.io
```

---

## Navigation conditionnelle

L'application utilise un **stack navigator** dont les ecrans affiches dependent de l'etat d'authentification :

```
Utilisateur non connecte          Utilisateur connecte
┌──────────────────┐              ┌──────────────────┐
│   LoginScreen    │              │   HomeScreen     │
│   (pas de header)│              │   EventScreen    │
├──────────────────┤              │   PlaylistScreen │
│  RegisterScreen  │              │   ProfileScreen  │
│  (pas de header) │              └──────────────────┘
└──────────────────┘
```

### Comment ca marche

Le composant `AppNavigator` lit le token depuis le store Zustand :

```typescript
const { accessToken, isLoading, loadTokens } = useAuthStore();

useEffect(() => {
  loadTokens(); // Charge les tokens depuis AsyncStorage au demarrage
}, []);
```

- Si `isLoading` est `true` → affiche un spinner (chargement des tokens depuis le stockage)
- Si `accessToken` est `null` → affiche les ecrans Login et Register
- Si `accessToken` existe → affiche les ecrans Home, Event, Playlist, Profile

Le basculement est **automatique** : quand `setTokens()` est appele (apres un login reussi), le store se met a jour, le composant re-render, et la navigation bascule vers les ecrans authentifies. Pas besoin de `navigation.navigate()` manuel.

### Typage des routes

Les parametres de chaque ecran sont types via `RootStackParamList` :

```typescript
export type RootStackParamList = {
  Login: undefined;           // Pas de parametre
  Register: undefined;
  Home: undefined;
  Event: { eventId: string }; // Recoit l'ID de l'evenement
  Playlist: { playlistId: string };
  Profile: undefined;
};
```

---

## Gestion d'etat avec Zustand

On utilise **Zustand** plutot que Redux ou Context API. C'est plus simple, pas de provider a wrapper, et on peut acceder au store depuis n'importe ou (meme en dehors des composants React, comme dans les intercepteurs Axios).

### Le store `authStore`

```typescript
interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  setTokens: (access: string, refresh: string) => void;
  logout: () => void;
  loadTokens: () => Promise<void>;
}
```

| Methode | Role |
|---------|------|
| `setTokens(access, refresh)` | Sauvegarde les tokens en memoire **et** dans AsyncStorage |
| `logout()` | Supprime les tokens partout (memoire + AsyncStorage) |
| `loadTokens()` | Au demarrage de l'app, recharge les tokens depuis AsyncStorage |

### Pourquoi AsyncStorage ?

Les tokens JWT doivent survivre a la fermeture de l'application. AsyncStorage est le stockage cle-valeur persistant de React Native (equivalent du localStorage web). Au lancement, `loadTokens()` les recupere pour reconnecter l'utilisateur automatiquement.

---

## Client HTTP (Axios)

L'instance Axios dans `api.ts` est configuree avec deux intercepteurs :

### Intercepteur de requete (request)

Ajoute automatiquement le header `Authorization: Bearer <token>` a chaque requete :

```typescript
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

On utilise `useAuthStore.getState()` (acces hors React) au lieu du hook `useAuthStore()` parce que les intercepteurs ne sont pas des composants React.

### Intercepteur de reponse (response) — Refresh automatique

Si une requete recoit un `401 Unauthorized`, l'intercepteur tente automatiquement de rafraichir le token :

```
1. Requete → serveur repond 401
2. Intercepteur recupere le refreshToken du store
3. POST /api/auth/refresh avec le refreshToken
4. Si OK → stocke les nouveaux tokens, renvoie la requete originale
5. Si echec → deconnecte l'utilisateur
```

Le flag `_retry` empeche une boucle infinie si le refresh echoue aussi avec un 401.

### URL du backend

L'URL est configurable via la variable d'environnement `EXPO_PUBLIC_API_URL` dans le fichier `.env` :

```
EXPO_PUBLIC_API_URL=http://localhost:3001
```

- **Simulateur iOS** : `localhost` fonctionne directement
- **Appareil physique / Android** : remplacer par l'IP locale du PC (ex: `http://192.168.1.42:3001`)

---

## Socket.io Client

Le fichier `socket.ts` fournit un client Socket.io avec un pattern singleton :

```typescript
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket'],
      autoConnect: false,
    });
  }
  return socket;
}
```

- `autoConnect: false` — la connexion est etablie manuellement via `connectSocket()` quand l'utilisateur se connecte
- `transports: ['websocket']` — force le WebSocket (pas de fallback long-polling, plus performant en mobile)
- `disconnectSocket()` — deconnecte proprement a la deconnexion de l'utilisateur

Le socket sera utilise dans les ecrans Event et Playlist pour recevoir les mises a jour en temps reel (nouveaux votes, tracks ajoutees/supprimees, reordonnancement).

---

## Ecrans implementes

### LoginScreen

Ecran de connexion avec :
- Champs email et mot de passe
- Bouton "Se connecter" qui appelle `POST /api/auth/login`
- Bouton "Continuer avec Google" (affiche un alert — OAuth natif necessite une config Expo specifique)
- Lien vers l'ecran d'inscription
- Gestion du loading (spinner sur le bouton) et des erreurs (Alert avec le message du serveur)

Au login reussi, `authStore.setTokens()` est appele → la navigation bascule automatiquement vers le HomeScreen.

### RegisterScreen

Ecran d'inscription avec :
- Champs nom, email et mot de passe
- Validation cote client (champs vides, mot de passe < 8 caracteres)
- Appel a `POST /api/auth/register`
- Meme bouton Google OAuth et meme logique que LoginScreen
- Lien retour vers le login

### HomeScreen

Ecran principal avec deux onglets :
- **Evenements** : liste les evenements publics (`GET /api/events`)
- **Playlists** : liste les playlists publiques (`GET /api/playlists`)

Chaque element affiche le nom, la description (tronquee) et un badge de licence (OPEN/INVITE_ONLY). Le pull-to-refresh est supporte via `RefreshControl`. Les donnees sont rechargees a chaque focus de l'ecran (`useFocusEffect`).

Un bouton "Profil" dans le header permet d'acceder au ProfileScreen.

Taper sur un evenement navigue vers `EventScreen({ eventId })`, taper sur une playlist vers `PlaylistScreen({ playlistId })`.

### ProfileScreen

Ecran de profil avec :
- Affichage de l'email (non modifiable)
- Champs editables : nom, info publique, info amis, info privee, preferences musicales
- Les preferences musicales sont saisies en texte libre separees par des virgules (converties en tableau a l'envoi)
- Bouton "Enregistrer" qui appelle `PUT /api/users/me`
- Bouton "Se deconnecter" avec confirmation (Alert) qui appelle `authStore.logout()`

La deconnexion vide les tokens → la navigation bascule automatiquement vers le LoginScreen.

### EventScreen (Service 1 — Vote Musical)

Ecran de detail d'un evenement avec vote en temps reel :

- **Chargement** : `GET /api/events/:id` (details) + `GET /api/events/:id/tracks` (tracklist triee par votes)
- **Formulaire d'ajout** : titre + artiste → `POST /api/events/:id/tracks`
- **Tracklist** : FlatList avec rang, titre, artiste et bouton "Vote"
- **Vote** : `POST /api/events/:id/tracks/:trackId/vote` (envoie lat/lng factices pour les events LOCATION_TIME)
- **Temps reel** : Socket.io rejoint la room `event:<id>` au mount, ecoute `trackAdded` et `trackVoted` pour mettre a jour la liste instantanement sans recharger

Les tracks sont classees par nombre de votes decroissant. Quand un autre utilisateur vote ou ajoute une track, la liste se met a jour automatiquement grace au WebSocket.

### PlaylistScreen (Service 2 — Editeur de Playlist)

Ecran d'edition collaborative de playlist en temps reel :

- **Chargement** : `GET /api/playlists/:id` (details) + `GET /api/playlists/:id/tracks` (tracks triees par position)
- **Formulaire d'ajout** : titre + artiste → `POST /api/playlists/:id/tracks`
- **Tracklist** : FlatList avec position, titre, artiste et 3 boutons d'action :
  - **↑ / ↓** : deplace la track (`PUT /api/playlists/:id/tracks/:trackId/position`)
  - **✕** : supprime la track avec confirmation (`DELETE /api/playlists/:id/tracks/:trackId`)
- **Temps reel** : Socket.io rejoint la room `playlist:<id>`, ecoute `playlistTrackAdded`, `playlistTrackRemoved` et `playlistTrackReordered`

Le reordonnancement met a jour les positions de toutes les tracks via une transaction Prisma cote backend.

### UX clavier

Les deux ecrans (Event et Playlist) gerent le clavier correctement :
- `TouchableWithoutFeedback` + `Keyboard.dismiss` sur la vue principale
- `multiline={false}`, `returnKeyType="done"` et `onSubmitEditing={Keyboard.dismiss}` sur tous les TextInput
- `keyboardShouldPersistTaps="handled"` sur les FlatList

---

## Dependances installees

| Package | Role |
|---------|------|
| `@react-navigation/native` | Navigation entre ecrans |
| `@react-navigation/native-stack` | Stack navigator natif (performant) |
| `react-native-screens` | Prerequis de React Navigation (ecrans natifs) |
| `react-native-safe-area-context` | Gestion du safe area (encoche, barre de statut) |
| `axios` | Requetes HTTP vers l'API |
| `zustand` | State management leger |
| `@react-native-async-storage/async-storage` | Stockage persistant local |
| `socket.io-client` | Client WebSocket pour le temps reel |

---

## Lancer l'application

```bash
cd mobile
npm start          # Demarre Expo dev server

# Puis choisir :
# i → iOS simulator
# a → Android emulator
# Scanner le QR code → appareil physique (avec Expo Go)
```

Avant de lancer, s'assurer que le backend tourne (`make dev`) et que l'URL dans `.env` pointe vers le bon serveur.
