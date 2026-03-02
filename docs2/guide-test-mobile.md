# Guide — Tester l'app mobile sur son telephone

Ce guide explique comment lancer l'application Music Room sur un vrai telephone (iPhone ou Android) depuis ton Mac.

---

## Prerequis

1. **Node.js** installe sur ton Mac
2. **Le backend qui tourne** (`make dev` dans un terminal)
3. **Ton telephone et ton Mac sur le meme reseau Wi-Fi**
4. L'app **Expo Go** installee sur ton telephone :
   - iPhone : [App Store — Expo Go](https://apps.apple.com/app/expo-go/id982107779)
   - Android : [Play Store — Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)

---

## Etape 1 : Trouver l'IP locale de ton Mac

Ouvre un terminal et tape :

```bash
ipconfig getifaddr en0
```

Tu obtiendras quelque chose comme `192.168.1.42`. Note cette adresse, c'est l'IP de ton Mac sur le reseau local.

> Si ca ne retourne rien, essaie `en1` au lieu de `en0`, ou va dans **Preferences Systeme > Wi-Fi** et regarde l'adresse IP affichee.

---

## Etape 2 : Configurer l'URL du backend

Ouvre le fichier `mobile/.env` et remplace `localhost` par l'IP de ton Mac :

```
EXPO_PUBLIC_API_URL=http://192.168.1.42:3001
```

> **Important** : `localhost` ne fonctionne que sur le simulateur iOS. Sur un vrai telephone, il faut l'IP du Mac car le telephone accede au serveur via le reseau Wi-Fi.

---

## Etape 3 : Demarrer le backend

Dans un premier terminal :

```bash
make dev
```

Attendre de voir `Server running on port 3001`.

---

## Etape 4 : Demarrer Expo

Dans un deuxieme terminal :

```bash
cd mobile
npm start
```

Tu verras un QR code dans le terminal, et un menu comme ca :

```
› Press s │ switch to Expo Go
› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web
› Press r │ reload app
› Press j │ open debugger
```

> Si tu vois "development build" au lieu de "Expo Go" en haut, appuie sur `s` pour basculer en mode Expo Go.

---

## Etape 5 : Scanner le QR code

### iPhone

1. Ouvre l'app **Appareil photo** (pas Expo Go)
2. Pointe vers le QR code dans le terminal
3. Un lien Expo apparait en haut — tape dessus
4. L'app s'ouvre dans Expo Go

### Android

1. Ouvre l'app **Expo Go**
2. Tape sur "Scan QR code"
3. Scanne le QR code du terminal
4. L'app se charge

---

## Etape 6 : Tester

L'ecran de login devrait apparaitre. Tu peux :

1. **Creer un compte** : taper sur "S'inscrire", remplir le formulaire
2. **Se connecter** : entrer email + mot de passe
3. **Naviguer** : voir les evenements et playlists, acceder au profil
4. **Se deconnecter** : Profil > Se deconnecter

---

## Depannage

### "Network request failed" ou ecran blanc

Le telephone n'arrive pas a joindre le backend. Verifier :

1. **Meme Wi-Fi** : le Mac et le telephone doivent etre sur le meme reseau
2. **Bonne IP dans `.env`** : verifier que `EXPO_PUBLIC_API_URL` pointe vers l'IP du Mac (pas `localhost`)
3. **Backend demarre** : verifier que `make dev` tourne et affiche `Server running on port 3001`
4. **Pare-feu Mac** : si tu as un pare-feu actif, autorise les connexions entrantes sur le port 3001
   - Preferences Systeme > Securite > Pare-feu > Options > Autoriser les connexions entrantes pour Node.js
5. **Redemarrer Expo** : arreter (`Ctrl+C`) et relancer `npm start`

### Le QR code ne s'affiche pas

Essayer avec le flag tunnel :

```bash
npx expo start --tunnel
```

Ca utilise un tunnel ngrok au lieu du reseau local. Plus lent mais fonctionne meme si le Wi-Fi bloque les connexions locales.

> Attention : le tunnel ne redirige que Expo, pas le backend. Il faut quand meme que le telephone puisse atteindre l'IP du Mac sur le port 3001.

### "Something went wrong" dans Expo Go

Verifier la compatibilite de la version Expo Go avec le SDK :
- L'app utilise **Expo SDK 55**
- S'assurer d'avoir la **derniere version** d'Expo Go installee depuis le store

### Les modifications ne s'appliquent pas

- Secouer le telephone pour ouvrir le menu developpeur, puis "Reload"
- Ou appuyer sur `r` dans le terminal Expo

### Changement d'IP

Si tu changes de reseau Wi-Fi :
1. Retrouver la nouvelle IP : `ipconfig getifaddr en0`
2. Mettre a jour `mobile/.env`
3. Redemarrer Expo (`Ctrl+C` puis `npm start`)

---

## Resume rapide

```bash
# 1. Trouver ton IP
ipconfig getifaddr en0              # → 192.168.1.42

# 2. Mettre a jour mobile/.env
# EXPO_PUBLIC_API_URL=http://192.168.1.42:3001

# 3. Lancer le backend
make dev

# 4. Lancer Expo (autre terminal)
cd mobile && npm start

# 5. Scanner le QR code avec ton telephone
```
