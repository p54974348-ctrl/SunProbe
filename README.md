# SunProbe

Sonde d'ensoleillement. On lui décrit **une surface** — position, inclinaison, orientation — et **un instant**, elle rend un **score de 0 à 100** et un **état** — `plein soleil`, `soleil faible`, `ombre`, `nuit` — directement consommable par un scénario domotique.

Une façade sud, une fenêtre ouest et un toit plat au même endroit reçoivent trois choses différentes. La sonde les distingue.

Aucune clé d'API, aucune inscription, aucun compte.

---

## Démarrer en trente secondes

Ouvrez `prototype/sunprobe-prototype.html` d'un double-clic. C'est un fichier unique, sans installation ni serveur.

## Version complète

```bash
npm run serve        # http://localhost:5173
```

Un serveur HTTP est nécessaire : les modules ES ne se chargent pas depuis `file://`.
La version complète ajoute la carte cliquable, la courbe de la journée et le lien partageable.

## Mise en ligne

La page appelle Open-Meteo directement depuis le navigateur : **aucun serveur n'est nécessaire** pour la publier.

| Hébergeur | Page | API domotique | Mise en place |
|---|---|---|---|
| **GitHub Pages** | ✅ | ❌ | Settings → Pages → `main` / root |
| **Cloudflare Pages** | ✅ | ✅ | Connecter le dépôt, aucune commande de construction |
| **Chez soi** (Pi, NAS) | ✅ | ✅ | `node server/sunprobe-api.mjs` |

Pour un usage domotique, la combinaison la plus saine est **la page sur GitHub Pages et l'API à la maison** : votre installation ne dépend alors d'aucun service extérieur et vos coordonnées ne sont pas publiées.

Détail des trois chemins, quotas et fermeture de l'endpoint : [docs/HEBERGEMENT.md](docs/HEBERGEMENT.md).

## Service pour la domotique

Une page web ne se laisse pas interroger par un automatisme. Ce service, lui, oui :

Un automatisme ne sait pas lire du HTML : c'est cet endpoint JSON qu'il interroge, en lui passant la position et l'orientation de la surface.

```bash
npm start

# Le sol, à plat
curl 'http://localhost:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993'

# Une baie vitrée plein sud
curl 'http://localhost:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993&inclinaison=90&orientation=180'
```

| Paramètre | Défaut | Sens |
|---|---|---|
| `lat`, `lon` | requis | Position, degrés décimaux. |
| `inclinaison` | `0` | 0 = horizontal, 90 = vertical (mur, fenêtre). |
| `orientation` | `180` | Azimut depuis le nord : 90 = E, 180 = S, 270 = O. |
| `albedo` | `0.2` | Réflectivité du sol. 0.6 = neige fraîche. |
| `at` | maintenant | `AAAA-MM-JJTHH:MM`, heure locale du point. |

Voir [docs/DOMOTIQUE.md](docs/DOMOTIQUE.md) pour Home Assistant, Jeedom et Node-RED.

## Continuer le développement ailleurs

`CLAUDE.md` à la racine tient lieu de mémoire du projet : conventions, pièges déjà rencontrés, état des lieux, pistes ouvertes. Il est relu au début de chaque session Claude Code, en terminal comme dans le cloud.

Le dépôt doit être poussé sur GitHub — c'est le prérequis des sessions cloud. Marche à suivre et façon de formuler une tâche : [docs/REPRISE.md](docs/REPRISE.md).

## Tests

```bash
npm test
```

155 vérifications, sans aucun accès réseau externe :

- étanchéité des couches : le garde-fou `tests/architecture.test.mjs` fait échouer la suite si le noyau touche au réseau ou au DOM, ou si un seuil est codé en dur hors de `config.js` ;
- position solaire recalée sur des repères astronomiques indépendants — hauteur aux deux solstices, heure du midi solaire, azimut plein sud dans l'hémisphère nord et plein nord à Sydney, soleil de minuit à Tromsø ;
- seuils de score et cas limites (nuit, données absentes, saturation) ;
- sélection du pas horaire, y compris la convention de moyenne sur l'heure précédente ;
- tracé du graphique, sans débordement ni valeur non numérique, jusqu'à la nuit polaire ;
- chaîne complète de bout en bout, avec une réponse d'API simulée ;
- physique du plan orienté : angle d'incidence, contributions directe, diffuse et réfléchie, albédo, et le cas d'école du mur sud qui reçoit plus en hiver qu'en été ;
- concordance stricte entre le prototype autonome et les modules, sur 150 configurations — écart maximal nul ;
- les deux implémentations de l'API — service Node interrogé en HTTP sur localhost, et fonction Cloudflare dans un environnement Workers simulé : paramètres de surface, validation, cache, restriction par point, temps processeur.

---

## Ce que rend la sonde

```json
{
  "version": 1,
  "horodatage_utc": "2026-07-25T12:00:00.000Z",
  "horodatage_local": "2026-07-25T14:00",
  "fuseau": "Europe/Paris",
  "point": { "latitude": 49.4431, "longitude": 1.0993, "altitude_m": 32, "libelle": "Rouen" },
  "surface": {
    "inclinaison_deg": 90, "orientation_deg": 180,
    "orientation_cardinal": "S", "albedo": 0.2
  },
  "etat": "soleil faible",
  "score": 54,
  "soleil_direct": true,
  "mesures": {
    "irradiance_surface_w_m2": 484,
    "surface_direct_w_m2": 348,
    "surface_diffus_w_m2": 65,
    "surface_sol_w_m2": 71,
    "ghi_w_m2": 710, "dni_w_m2": 781, "dhi_w_m2": 128,
    "couverture_nuageuse_pct": 18,
    "composantes_estimees": false
  },
  "geometrie": {
    "hauteur_deg": 60.15, "azimut_deg": 178.98, "azimut_cardinal": "S",
    "angle_incidence_deg": 60.15,
    "ghi_ciel_clair_w_m2": 890, "indice_ciel_clair": 0.798
  },
  "source": "open-meteo",
  "fraicheur": "ok"
}
```

Trois champs pilotent : `score`, `etat`, et `soleil_direct` — le faisceau touche-t-il cette face ? Le reste sert au diagnostic.

Ici, un mur sud noté 54 alors que l'horizontale est à 79 : à 14 h en juillet le soleil est haut et rase la façade. En décembre, le rapport s'inverse.

## Architecture

Trois couches, une responsabilité chacune, aucune remontée de dépendance :

```
données  ->  calcul  ->  affichage
src/data     src/core     src/ui
```

- **`src/core/`** ne connaît ni le réseau ni le DOM. Fonctions pures, testables hors ligne, importables aussi bien par le navigateur que par Node. C'est le seul endroit où « plein soleil » est défini.
- **`src/data/`** est la seule couche autorisée à faire un `fetch`. Changer de fournisseur de données revient à réécrire `irradiance.js`, rien d'autre.
- **`src/ui/`** est la seule couche à toucher au DOM. Elle ne calcule rien.

Détail dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Logique de calcul

Voir [docs/CALCUL.md](docs/CALCUL.md). En bref :

1. **La géométrie est calculée en local**, pas demandée au réseau. Hauteur et azimut du soleil viennent de l'algorithme NOAA, réfraction comprise.
2. **Le flux est demandé au réseau.** Open-Meteo fournit les trois composantes horizontales — global, direct, diffus — qui intègrent déjà la couverture nuageuse.
3. **Le flux est projeté sur la surface visée** : direct par l'angle d'incidence, diffus par le modèle de Hay-Davies, plus la réflexion du sol pondérée par l'albédo.
4. **Le score est ce flux ramené à une pleine échelle** de 900 W/m², réglable dans `src/config.js`.
5. **L'indice de ciel clair** compare le flux horizontal prévu à celui d'un ciel parfaitement dégagé (Haurwitz). Il qualifie le ciel, pas la surface, et reste donc identique quelle que soit l'orientation demandée.

## Réglage

Tous les seuils vivent dans [`src/config.js`](src/config.js). Aucun n'est écrit en dur ailleurs.

| Réglage | Défaut | Effet |
|---|---|---|
| `ghiPleineEchelle` | `900` | W/m² valant 100. Baisser pour l'hiver ou les hautes latitudes. |
| `seuils.pleinSoleil` | `60` | Score à partir duquel l'état bascule en `plein soleil`. |
| `seuils.soleilFaible` | `20` | Score à partir duquel l'état bascule en `soleil faible`. |
| `hauteurNuitDeg` | `-0.833` | Hauteur du soleil sous laquelle l'état devient `nuit`. |
| `surface.inclinaisonDeg` | `0` | Surface par défaut : horizontale. |
| `surface.orientationDeg` | `180` | Orientation par défaut : plein sud. |
| `surface.albedo` | `0.2` | Réflectivité du sol par défaut. |

## Limites connues

- **Le relief et les obstacles ne sont pas pris en compte.** La sonde sait que le soleil est géométriquement en face de votre fenêtre, pas qu'un immeuble se trouve entre les deux. `soleil_direct` décrit la géométrie, pas la visibilité réelle.
- **Ni débord de toit, ni brise-soleil, ni ombre portée du bâtiment sur lui-même.** Sur une fenêtre sud abritée, le score sera surestimé aux heures hautes en été.
- **Portée temporelle** : 92 jours en arrière, 16 jours en avant. Au-delà, la source refuse.
- **Le GHI est une prévision de modèle météo**, pas une mesure de capteur. L'erreur typique sur l'heure suivante est de l'ordre de 10 à 20 % par ciel partiellement nuageux.
- **Le modèle de ciel clair est empirique** (±10 %). Suffisant pour un indicateur, insuffisant pour dimensionner une installation photovoltaïque.
- **Pas de géocodage inverse** : un clic sur la carte donne des coordonnées, pas un nom de rue.

## Sources et licences

- Données météo : [Open-Meteo](https://open-meteo.com), CC BY 4.0, gratuit pour usage non commercial (moins de 10 000 appels par jour), sans clé. **L'attribution en pied de page est obligatoire.**
- Fond de carte : OpenStreetMap.
- Code : MIT.
