# Flux OAuth Google — Music Room

## Qu'est-ce que OAuth ?

OAuth est un moyen de permettre aux utilisateurs de se connecter avec leur compte Google au lieu de créer un nouveau mot de passe. L'utilisateur clique sur "Se connecter avec Google", est redirigé vers la page de connexion Google, et Google dit à notre backend "oui, cette personne est bien celle qu'elle prétend être". On ne voit ni ne stocke jamais le mot de passe Google de l'utilisateur.

## Comment ça fonctionne — Flux mobile

L'application mobile utilise un flux spécifique car elle ne peut pas faire de redirections navigateur de la même manière qu'une application web. Au lieu de rediriger vers Google, l'application mobile ouvre un navigateur modal, obtient un ID token Google, et l'envoie à notre backend pour vérification.

```
┌──────────┐         ┌──────────┐         ┌──────────┐         ┌──────────┐
│  App     │         │  Google  │         │ Backend  │         │ Base de  │
│  Mobile  │         │  OAuth   │         │          │         │ données  │
└────┬─────┘         └────┬─────┘         └────┬─────┘         └────┬─────┘
     │                     │                    │                    │
     │  1. L'utilisateur   │                    │                    │
     │  appuie sur         │                    │                    │
     │  "Se connecter      │                    │                    │
     │   avec Google"      │                    │                    │
     │                     │                    │                    │
     │  2. Ouvrir un       │                    │                    │
     │  navigateur modal   │                    │                    │
     │  avec la page de    │                    │                    │
     │  connexion Google   │                    │                    │
     │────────────────────▶│                    │                    │
     │                     │                    │                    │
     │  3. L'utilisateur   │                    │                    │
     │  entre ses          │                    │                    │
     │  identifiants       │                    │                    │
     │  Google (on ne les  │                    │                    │
     │  voit jamais)       │                    │                    │
     │                     │                    │                    │
     │  4. Google renvoie  │                    │                    │
     │  un ID token        │                    │                    │
     │◀────────────────────│                    │                    │
     │                     │                    │                    │
     │  5. POST /api/auth/google/mobile         │                    │
     │  { idToken: "eyJ..." }                   │                    │
     │─────────────────────────────────────────▶│                    │
     │                     │                    │                    │
     │                     │  6. Vérifier le    │                    │
     │                     │  token auprès de   │                    │
     │                     │  l'API Google      │                    │
     │                     │◀───────────────────│                    │
     │                     │───────────────────▶│                    │
     │                     │                    │                    │
     │                     │                    │  7. Vérifier : cet │
     │                     │                    │  ID Google ou cet  │
     │                     │                    │  email existe-t-il?│
     │                     │                    │───────────────────▶│
     │                     │                    │◀───────────────────│
     │                     │                    │                    │
     │                     │                    │  8a. Nouvel         │
     │                     │                    │  utilisateur :     │
     │                     │                    │  créer le compte   │
     │                     │                    │  8b. Email existant│
     │                     │                    │  : lier le Google  │
     │                     │                    │  ID                │
     │                     │                    │  8c. Google ID     │
     │                     │                    │  connu : simple    │
     │                     │                    │  connexion         │
     │                     │                    │───────────────────▶│
     │                     │                    │                    │
     │                     │                    │  9. Générer les    │
     │                     │                    │  tokens JWT        │
     │                     │                    │  access + refresh  │
     │                     │                    │                    │
     │  10. { user, accessToken, refreshToken } │                    │
     │◀─────────────────────────────────────────│                    │
     │                     │                    │                    │
     │  11. Stocker les    │                    │                    │
     │  tokens dans        │                    │                    │
     │  AsyncStorage       │                    │                    │
     │  Naviguer vers      │                    │                    │
     │  l'accueil          │                    │                    │
```

## Parcours du code étape par étape

### Étapes 1-4 : Le mobile ouvre la connexion Google

**Fichier** : `mobile/src/screens/LoginScreen.tsx`

L'application mobile utilise `expo-auth-session` pour ouvrir un modal de connexion Google. Cette bibliothèque gère la popup navigateur et capture la réponse Google :

1. L'application ouvre une fenêtre navigateur vers l'écran de consentement OAuth de Google
2. L'utilisateur se connecte avec son compte Google
3. Google redirige vers l'application avec un ID token
4. La bibliothèque `expo-auth-session` capture ce token

Le Google Client ID utilisé ici (`EXPO_PUBLIC_GOOGLE_CLIENT_ID`) doit correspondre à celui configuré dans la Google Cloud Console.

### Étape 5 : Le mobile envoie le token au backend

**Fichier** : `mobile/src/screens/LoginScreen.tsx`

Après avoir obtenu l'ID token Google, l'application mobile l'envoie à notre backend :

```
POST /api/auth/google/mobile
{ "idToken": "eyJhbGciOiJSUzI1NiIs..." }
```

### Étape 6 : Le backend vérifie auprès de Google

**Fichier** : `backend/src/services/auth.service.ts:195-238` — `googleMobileLogin()`

Le backend appelle l'API de vérification de token de Google :

```
GET https://oauth2.googleapis.com/tokeninfo?id_token=eyJ...
```

Google répond avec le payload du token décodé :
```json
{
  "sub": "109876543210",          // ID utilisateur Google
  "email": "user@gmail.com",
  "email_verified": "true",
  "name": "John Doe",
  "aud": "123456789.apps.googleusercontent.com"  // Doit correspondre à notre client ID
}
```

Le backend effectue deux vérifications critiques :
1. **Vérification de l'audience** : `payload.aud` doit être égal à notre `GOOGLE_CLIENT_ID`. Cela empêche les tokens destinés à d'autres applications d'être acceptés.
2. **Email vérifié** : Google doit avoir confirmé que l'email appartient bien à cette personne.

### Étapes 7-8 : Trouver ou créer l'utilisateur

**Fichier** : `backend/src/services/auth.service.ts:212-232`

Trois scénarios sont gérés :

| Scénario | Ce qui se passe |
|----------|----------------|
| **Google ID déjà connu** | Utilisateur trouvé par `googleId` → simple connexion |
| **Email existe mais pas de Google ID** | Utilisateur trouvé par `email` → lier le Google ID au compte existant, marquer l'email comme vérifié |
| **Utilisateur complètement nouveau** | Créer un nouveau compte avec les données Google (pas de mot de passe nécessaire) |

Cette logique garantit que si quelqu'un s'est d'abord inscrit avec email/mot de passe puis essaie OAuth Google avec le même email, les comptes sont fusionnés plutôt que dupliqués.

### Étapes 9-11 : Générer les tokens et répondre

Identique à une connexion classique : le backend génère un JWT access token (15min) et un refresh token (7j), les envoie à l'application mobile, qui les stocke dans AsyncStorage.

## Flux OAuth web (Passport.js)

Il existe aussi un flux OAuth web traditionnel utilisant Passport.js pour l'accès navigateur :

```
Navigateur                      Backend                     Google
  │                                │                           │
  │  GET /api/auth/google          │                           │
  │───────────────────────────────▶│                           │
  │                                │  Redirection vers Google  │
  │  302 Redirect                  │──────────────────────────▶│
  │◀───────────────────────────────│                           │
  │                                │                           │
  │  L'utilisateur se connecte     │                           │
  │  sur Google                    │                           │
  │───────────────────────────────────────────────────────────▶│
  │                                │                           │
  │                                │  Callback Google avec     │
  │                                │  les données du profil    │
  │  GET /api/auth/google/callback │◀──────────────────────────│
  │───────────────────────────────▶│                           │
  │                                │  Trouver/créer            │
  │                                │  l'utilisateur            │
  │                                │  Générer les tokens JWT   │
  │                                │                           │
  │  Redirection avec les tokens   │                           │
  │◀───────────────────────────────│                           │
```

**Fichier** : `backend/src/config/passport.ts` — Configuration de la stratégie Google pour Passport.js.

La stratégie Passport effectue la même logique de recherche d'utilisateur (trouver par googleId ou email, créer si nouveau). La principale différence est qu'elle fonctionne par callback (Google redirige le navigateur vers `/api/auth/google/callback`).

## Lier Google à un compte existant

Les utilisateurs qui se sont inscrits avec email/mot de passe peuvent ensuite lier leur compte Google :

```
PUT /api/auth/link-google
Authorization: Bearer <token>
{ "googleId": "109876543210" }
```

**Fichier** : `backend/src/services/auth.service.ts:169-181` — `linkGoogle()`

Cela vérifie que le Google ID n'est pas déjà lié à un autre compte (conflit 409), puis met à jour le champ `googleId` de l'utilisateur.

## Configuration requise

| Variable | Où | Objectif |
|----------|-------|---------|
| `GOOGLE_CLIENT_ID` | Backend `.env` | Identifie notre application auprès de Google |
| `GOOGLE_CLIENT_SECRET` | Backend `.env` | Clé secrète pour le callback OAuth web |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Mobile `.env` | Même client ID pour le flux mobile |

Les deux doivent pointer vers le même projet Google Cloud. La Google Cloud Console doit avoir l'écran de consentement OAuth configuré avec les URI de redirection correctes.
