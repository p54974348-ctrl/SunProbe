# Logique de calcul

Le principe tient en une phrase : **la géométrie se calcule, le flux se demande**.

La position du soleil est un problème d'astronomie résolu depuis longtemps, déterministe, sans incertitude à notre échelle — l'appeler par le réseau serait absurde. La quantité de lumière qui traverse l'atmosphère, elle, dépend des nuages, donc d'une prévision météo qu'il faut aller chercher.

---

## 1. Position du soleil — `src/core/solar-position.js`

Algorithme NOAA / *Astronomical Almanac* dit « basse précision » : erreur inférieure à 0,02° entre 1950 et 2050.

Enchaînement :

1. Jours juliens écoulés depuis J2000.0.
2. Longitude moyenne et anomalie moyenne du Soleil.
3. Longitude écliptique apparente, corrigée de l'équation du centre.
4. **Déclinaison** δ — la « latitude » du soleil, entre −23,44° et +23,44° selon la saison.
5. **Équation du temps** — l'écart entre midi à l'horloge et midi solaire vrai, jusqu'à ±16 minutes selon la période de l'année.
6. **Angle horaire** H — 0° au midi solaire, négatif le matin, 15° par heure.
7. **Hauteur** : `sin h = sin φ · sin δ + cos φ · cos δ · cos H`
8. **Azimut**, depuis le nord dans le sens horaire.
9. **Réfraction atmosphérique** (formule de Sæmundsson) ajoutée à la hauteur : elle relève le soleil apparent d'environ 0,57° à l'horizon. C'est elle qui fait que le soleil est encore visible alors qu'il est géométriquement déjà couché.

Vérifications dans `tests/noyau.test.mjs`, sur des repères indépendants du code : hauteur maximale aux deux solstices à Rouen (64,0° et 17,1°, conformes à `90 − φ ± 23,44`), midi solaire à 11:57 UTC, azimut plein sud à midi dans l'hémisphère nord et plein nord à Sydney, soleil de minuit à Tromsø.

## 2. Flux mesuré — `src/data/irradiance.js`

Source : Open-Meteo, endpoint `/v1/forecast`. Quatre variables horaires :

| Variable | Sens |
|---|---|
| `shortwave_radiation` | **GHI** — irradiance globale sur plan horizontal, W/m². C'est la grandeur qui porte le score. |
| `direct_normal_irradiance` | **DNI** — faisceau direct sur un plan perpendiculaire au soleil. |
| `diffuse_radiation` | **DHI** — part diffusée par le ciel et les nuages. |
| `cloud_cover` | Couverture nuageuse, %. Sert au diagnostic, pas au score. |

Le GHI intègre déjà l'effet des nuages : c'est la sortie du modèle météo, pas une valeur théorique.

### Un piège d'horodatage

Chez Open-Meteo, les variables de rayonnement sont des **moyennes sur l'heure qui précède** l'horodatage. La valeur estampillée `14:00` décrit l'intervalle `]13:00, 14:00]`, pas l'instant 14:00.

`selectionnerPas()` en tient compte : pour un instant visé, il retient le premier pas dont l'estampille est postérieure ou égale. Une demande à 13:30 tombe donc dans le pas `14:00`. Se tromper ici décale systématiquement le résultat d'une heure, ce qui est invisible à l'œil et faux toute la journée.

Le graphique place chaque valeur au **milieu** de son intervalle, et y calcule la géométrie correspondante.

## 3. Référence ciel clair — `src/core/clear-sky.js`

Modèle de Haurwitz (1946) :

```
GHI_clair = 1098 · cos(z) · exp(−0,059 / cos(z))
```

où `cos(z) = sin(hauteur)`. Aucun paramètre d'entrée hormis la hauteur du soleil : ni turbidité, ni altitude, ni vapeur d'eau.

C'est délibérément grossier. Le rôle de cette valeur n'est pas de prédire, mais de **fournir un étalon** : combien ce point recevrait-il, maintenant, si le ciel était vide ? Précision typique ±10 %.

**Indice de ciel clair** :

```
kc = GHI_prévu / GHI_clair        plafonné à 1,15
```

- `kc ≈ 1` — ciel dégagé
- `kc ≈ 0,6` — voile nuageux
- `kc ≈ 0,3` — couvert
- `kc > 1` — possible quelques minutes en bord de nuage, par réflexion (surirradiance). D'où le plafond.

## 4. Passage à la surface visée — `src/core/plan.js`

Les données météo décrivent un **plan horizontal**. Une façade, une fenêtre ou un panneau ne reçoivent pas la même chose : tout dépend de l'angle entre le rayon solaire et la normale à la surface. C'est cette étape qui rend la sonde utilisable pour piloter un volet.

Deux paramètres décrivent la surface :

| | |
|---|---|
| `inclinaison` | 0° = horizontal (sol, toit plat), 90° = vertical (mur, fenêtre) |
| `orientation` | azimut de la normale, depuis le nord dans le sens horaire : 0 = N, 90 = E, 180 = S, 270 = O. Sans effet si l'inclinaison vaut 0. |

### Angle d'incidence

```
cos θ = sin(h)·cos(β) + cos(h)·sin(β)·cos(γs − γc)
```

où `h` est la hauteur du soleil, `β` l'inclinaison, `γs` l'azimut du soleil et `γc` l'orientation de la surface.

Quand `cos θ ≤ 0`, le soleil est **derrière** le plan : la surface ne reçoit plus aucun rayonnement direct. C'est le champ `soleil_direct` de la sortie, et c'est souvent l'information la plus utile en domotique — inutile de fermer un volet que le soleil ne touche pas.

### Les trois contributions

| Contribution | Modèle |
|---|---|
| **Direct** — le faisceau projeté sur la surface | `DNI · max(0, cos θ)` |
| **Diffus** — la voûte céleste | Hay-Davies |
| **Sol** — la réflexion devant la surface | `GHI · albédo · (1 − cos β)/2` |

Hay-Davies pondère le diffus par un indice d'anisotropie `Ai = DNI / E0` :

```
diffus = DHI · [ Ai · (cos θ / cos z) + (1 − Ai) · (1 + cos β)/2 ]
```

Par ciel clair, une bonne part du rayonnement diffus vient d'autour du disque solaire et suit donc le faisceau direct, au lieu d'être répartie uniformément sur le ciel. Un modèle isotrope sous-estimerait nettement une surface tournée vers le soleil. Le rapport `cos θ / cos z` est borné près de l'horizon, où il diverge.

L'albédo par défaut vaut 0,2 (herbe, bitume). La neige fraîche monte à 0,6, ce qui n'est pas anecdotique : sur un mur vertical, le sol occupe la moitié du champ de vue.

### Le plan horizontal est un cas particulier

Quand l'inclinaison vaut 0, la sonde renvoie **le GHI mesuré tel quel** plutôt que de le reconstruire à partir de ses composantes. Reconstruire donnerait un résultat très proche mais pas identique, et introduirait un écart là où la source est déjà exacte. C'est aussi ce qui garantit qu'un client existant, qui ne demande aucune orientation, reçoit exactement ce qu'il recevait avant.

### Si la source ne fournit pas DNI et DHI

Le calcul sur plan incliné a besoin des trois composantes. Quand la source n'en fournit qu'une, la corrélation d'**Erbs** sépare le global horizontal en une part diffuse et une part directe, à partir du seul indice de clarté `kt = GHI / (E0 · sin h)`.

Testé sur des données cohérentes, l'écart avec les composantes réellement mesurées est de l'ordre de **1 %**. Le champ `composantes_estimees` signale quand ce filet a servi.

### Un résultat contre-intuitif, et juste

Un mur vertical plein sud reçoit **plus** de soleil en hiver qu'en été. En décembre à Rouen, le soleil culmine à 17° : ses rayons arrivent presque perpendiculairement au mur. En juin il culmine à 64° et rase la façade. Les tests vérifient explicitement ce comportement — c'est le principe même du solaire passif, et un calcul qui l'inverserait serait faux.

## 5. Score et état — `src/core/score.js`

```
score = 100 × min(1, irradiance_surface / 900)
```

`irradiance_surface` est ce que reçoit la surface décrite ci-dessus. Sans inclinaison demandée, c'est le GHI, et la formule redevient `100 × min(1, GHI / 900)`.

**Pourquoi le GHI absolu, et non l'indice de clarté ?** Parce qu'un automatisme réagit à la lumière qui arrive réellement, pas à sa proportion du maximum théorique. Un matin de décembre parfaitement dégagé a `kc = 1` mais n'apporte que 120 W/m² : ce n'est pas le moment de fermer les volets. Le score absolu dit cela ; l'indice de clarté ne le dirait pas. Les deux sont exposés, `score` pilote, `indice_ciel_clair` explique.

**Pourquoi 900 W/m² ?** C'est l'ordre de grandeur d'un midi d'été dégagé à latitude moyenne. Le score atteint donc 100 les bons jours sans jamais y stagner. Aux hautes latitudes ou pour un usage hivernal, abaisser `ghiPleineEchelle` dans `src/config.js` redonne de la dynamique.

**États** :

| Condition | État |
|---|---|
| hauteur ≤ −0,833° | `nuit` |
| score ≥ 60 | `plein soleil` |
| score ≥ 20 | `soleil faible` |
| sinon | `ombre` |

Le seuil de nuit à −0,833° correspond au disque solaire tangent à l'horizon, réfraction comprise — la définition conventionnelle du coucher.

`nuit` s'ajoute aux trois états demandés. Sans lui, toute nuit serait rapportée comme `ombre`, et un scénario ne pourrait plus distinguer « il fait sombre parce qu'il est minuit » de « il fait sombre parce qu'il pleut ». Le score reste 0 dans les deux cas : un automatisme qui ne teste que le score n'a rien à changer.

## Ce que le calcul ne fait pas

- **Aucun masque d'horizon.** Relief, bâtiment, arbre : rien n'est modélisé. La sonde sait que le soleil est géométriquement en face de votre fenêtre, pas qu'un immeuble se trouve entre les deux. Pour aller plus loin, l'API PVGIS du Centre commun de recherche européen expose un profil d'horizon par coordonnées ; l'appliquer reviendrait à annuler la composante directe quand le soleil passe sous ce profil, et à ne garder que le diffus et le sol.
- **Aucun ombrage propre du bâtiment.** Un débord de toit, un balcon ou un brise-soleil réduisent fortement l'apport direct sur une fenêtre en été, et pas du tout en hiver. Rien de tout cela n'est pris en compte.
- **Aucune mesure au sol.** Tout vient d'un modèle de prévision. Un pyranomètre réel dirait autre chose, surtout par ciel de traîne.
- **Modèles empiriques.** Haurwitz pour le ciel clair (±10 %), Hay-Davies pour le diffus incliné, Erbs en secours. Suffisant pour un indicateur domotique, insuffisant pour dimensionner une installation photovoltaïque : pour cela, PVGIS ou pvlib font le travail sérieusement.
