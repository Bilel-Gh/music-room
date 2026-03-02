# Bonus VI.2 — Reflexion IoT / iBeacon

## Contexte du sujet

Le sujet demande de reflechir a l'integration de la technologie **iBeacon** (Bluetooth Low Energy) pour detecter automatiquement la proximite d'un utilisateur avec un evenement musical enregistre sur la plateforme. L'objectif : lorsqu'un utilisateur s'approche physiquement d'un lieu ou se deroule un evenement public, il recoit automatiquement des informations sur cet evenement (nom, type de musique, comment y acceder, etc.).

## Problematique materielle

Les iBeacons sont des balises physiques Bluetooth qui emettent un signal a intervalles reguliers. Pour une demonstration en conditions reelles, il faudrait :

- Des balises iBeacon physiques deployees sur les lieux des evenements
- Un appareil mobile avec Bluetooth active et les permissions adequates
- Une infrastructure de gestion des balises (UUID, major/minor values)

Ces contraintes materielles ne sont pas realisables dans le cadre d'une soutenance en salle.

## Solution implementee : simulation par geofencing GPS

Pour repondre a l'exigence metier tout en restant demonstrable, nous avons implemente une **simulation logicielle** basee sur la geolocalisation GPS :

### Fonctionnement technique

1. **Recuperation de la position** : A l'ouverture du feed public sur le `HomeScreen`, l'application demande les permissions de localisation via `expo-location` et recupere les coordonnees GPS de l'utilisateur.

2. **Filtrage des evenements geolocalisables** : Parmi les evenements publics charges, on filtre ceux de type `LOCATION_TIME` qui possedent des coordonnees GPS (`latitude`, `longitude`) enregistrees en base.

3. **Calcul de distance** : La distance entre l'utilisateur et chaque evenement est calculee grace a la **formule de Haversine**, qui donne la distance en kilometres entre deux points a la surface de la Terre en tenant compte de la courbure terrestre.

4. **Detection de proximite** : Si un evenement se trouve dans un rayon de **5 km** (simulant la portee d'un reseau de beacons couvrant un quartier ou un lieu), l'evenement le plus proche est identifie.

5. **Notification visuelle** : Un bandeau distinctif (violet, avec icone radio) s'affiche en haut de l'ecran d'accueil, indiquant le nom de l'evenement et la distance. L'utilisateur peut :
   - **Appuyer sur le bandeau** pour naviguer directement vers l'evenement
   - **Fermer le bandeau** via le bouton de fermeture

### Equivalence avec un systeme iBeacon reel

| Aspect | iBeacon reel | Notre simulation |
|--------|-------------|-----------------|
| Detection de proximite | Signal Bluetooth BLE | Coordonnees GPS + Haversine |
| Portee | ~70m par balise | 5 km (rayon configurable) |
| Declencheur | Entree dans la zone du beacon | Chargement du feed public |
| Information affichee | Identique | Identique |
| Action utilisateur | Navigation vers l'evenement | Navigation vers l'evenement |

### Limites et evolution possible

- Le GPS est moins precis que le Bluetooth pour la micro-localisation (interieur de batiment)
- En production, on combinerait GPS (macro-localisation) + iBeacon (micro-localisation)
- Le rayon de 5 km est volontairement large pour faciliter la demonstration ; un systeme reel utiliserait des zones plus petites
- La verification ne se fait qu'une fois par session pour eviter de solliciter le GPS en boucle

## Conclusion

Cette approche permet de valider le concept metier de **notification automatique par proximite** sans dependance materielle, tout en utilisant les memes principes fondamentaux : detection de position, calcul de distance, et notification contextuelle a l'utilisateur.
