# SunProbe — instructions de projet

Sonde d'ensoleillement. On lui décrit **une surface** (position, inclinaison, orientation) et **un instant**, elle rend un **score 0–100** et un **état** consommables par un scénario domotique.

Réponds en français. Le code, les commentaires, les noms de variables et la documentation sont en français — c'est délibéré, ne pas angliciser.

---

## Commandes

```bash
npm test        # suite complète, 206 vérifications, aucun accès réseau externe
npm run serve   # page sur http://localhost:5173 (les modules ES exigent un serveur HTTP)
npm start       # service JSON domotique sur http://localhost:8787
```

Node ≥ 18. **Aucune dépendance de production, aucun bundler, aucun framework.** Ne pas en ajouter sans raison forte : le projet doit rester lisible et modifiable dans cinq ans par quelqu'un qui veut juste déplacer un seuil.

`npm test` doit passer avant tout commit. Il tourne hors ligne : toute la suite simule `fetch`.

### Accès réseau en session cloud

Les tests n'en ont pas besoin. Pour toucher la vraie source de données, autoriser :

- `api.open-meteo.com` — irradiance
- `geocoding-api.open-meteo.com` — géocodage

`npm run serve` télécharge `serve` via npx, donc le registre npm doit être joignable (couvert par le mode « Trusted »).

---

## Architecture — la règle à ne pas casser

Les dépendances descendent, jamais l'inverse.

```
src/data  →  src/core  →  src/ui
(réseau)     (calcul pur)   (DOM)
             ↑
        src/sonde.js  ← pipeline commun aux 3 points d'entrée
```

| Couche | Peut | Ne peut pas |
|---|---|---|
| `src/core/` | calculer | `fetch`, `document`, `window` |
| `src/data/` | `fetch` | calcul solaire |
| `src/ui/` | toucher le DOM | `fetch`, calculer |
| `src/sonde.js` | enchaîner data → core | toucher le DOM |

**Pourquoi ça compte** : `core` et `sonde` ne dépendant d'aucun module Node, ils tournent à l'identique dans trois environnements — navigateur, Node, isolat Cloudflare Workers. Les trois points d'entrée (`index.html`, `server/sunprobe-api.mjs`, `functions/api/v1/ensoleillement.js`) ne diffèrent que par leur enveloppe ; `worker.js` à la racine est une enveloppe de plus (flux « Worker » de Cloudflare), qui réutilise la fonction Pages telle quelle. Importer `node:http` dans `core` casserait la fonction Cloudflare sans que rien ne le signale localement.

Ces règles ne sont pas seulement écrites, elles sont **exécutées** : `tests/architecture.test.mjs` les vérifie et fait échouer `npm test` en cas d'infraction. Il attrape aussi un seuil codé en dur dans `score.js`. Ne pas le contourner — le corriger, ou en discuter avant de modifier la règle.

**Tous les seuils vivent dans `src/config.js`.** Aucune valeur de seuil en dur ailleurs. `src/core/score.js` est le seul endroit où « plein soleil » est défini.

---

## Pièges déjà rencontrés

Chacun a coûté un bug réel. Les tests correspondants existent : ne pas les supprimer.

1. **Horodatage Open-Meteo.** Les variables de rayonnement sont des moyennes sur l'heure **précédant** l'estampille. La valeur `14:00` couvre `]13:00, 14:00]`. `selectionnerPas()` retient le premier pas dont l'estampille est ≥ à l'instant visé. Se tromper décale tout d'une heure, de façon invisible à l'œil et fausse toute la journée.

2. **`Number(null)` vaut `0`.** Un paramètre `lat` absent passait pour la latitude 0, au large du Ghana, avec un résultat parfaitement plausible et parfaitement faux. `src/core/requete.js` refuse explicitement le vide via `nombreStrict`. Toute nouvelle lecture de paramètre numérique doit passer par là.

3. **Les jeux de données de test doivent être physiquement cohérents** : `GHI = DNI·sin(h) + DHI`. Un triplet incohérent produit des écarts qu'on prend à tort pour des bugs. Utiliser l'assistant `coherent()` de `tests/plan.test.mjs`.

4. **Le prototype et la version Google Apps Script dupliquent la logique du noyau**, volontairement (un seul fichier chacun — zéro installation pour l'un, pas de modules ES chez Google pour l'autre). `tests/prototype.test.mjs` et `tests/apps-script.test.mjs` extraient leur script et comparent leurs résultats aux modules, écart toléré nul. **Toute modification de `src/core/plan.js`, `solar-position.js`, `clear-sky.js` ou `ensoleillement.js` doit être répercutée dans `prototype/sunprobe-prototype.html` et `apps-script/sunprobe.gs`**, sinon ces tests échouent — c'est leur rôle.

5. **Le plan horizontal est un cas particulier assumé.** Quand `inclinaison = 0`, `irradianceSurPlan()` renvoie le GHI mesuré tel quel plutôt que de le reconstruire depuis ses composantes. Ne pas « simplifier » en supprimant cette branche : elle garantit la rétrocompatibilité exacte des clients qui ne demandent aucune orientation.

---

## Contrat de sortie

`src/core/sortie-domotique.js`, champ `version` à `1`.

**On n'enlève jamais un champ et on ne change jamais le sens d'un champ existant sans incrémenter `version`.** Ajouter un champ reste rétrocompatible.

Trois champs pilotent un automatisme : `score`, `etat`, `soleil_direct`. Le reste sert au diagnostic. `ensoleillement_jour` (part du jour où la face reçoit le soleil direct, seuil OMM dans `config.js`) est un ajout rétrocompatible : `pourcentage` vaut `null` en nuit polaire, pas 0.

Paramètres d'API : `lat`, `lon` (requis), `at`, `inclinaison`, `orientation`, `albedo`, plus le couple facultatif `ifttt_evenement`/`ifttt_cle`. Sans paramètre de surface, la surface est horizontale et la réponse est identique à celle d'avant l'ajout de l'orientation.

Dans la page comme dans le prototype, les champs de surface sont **vides par défaut**. Vides → mesure du lieu, à plat, sans notion de surface visée. Orientation seule (ex. 329) → mur **vertical** tourné vers cette orientation ; une inclinaison saisie prime. `Number('')` valant 0 (piège n° 2), toute lecture de ces champs teste explicitement la chaîne vide.

La page accepte aussi `format` (`html` par défaut, `json`), par paramètre d'URL uniquement — pas de réglage dans le formulaire : qui veut du JSON veut une URL. En mode JSON, elle ne rend que la sortie brute et l'URL courante tient lieu de permalien. C'est un affichage navigateur — l'API machine reste le service Node et la fonction Cloudflare.

Deux natures de permalien : le lien **HTML** rejoue l'instant mesuré (il embarque `date` et `heure`) ; le lien **JSON** est une sonde vivante (lieu et surface seulement — chaque chargement mesure à l'heure courante du point, `at` absent dans le pipeline). Une URL JSON avec `date`/`heure` explicites reste figée.

Pont IFTTT : `ifttt_evenement` + `ifttt_cle`, sur **les trois points d'entrée** (les deux API, et la page en mode JSON). IFTTT ne sait pas lire la réponse d'une « web request » : c'est donc la sonde qui déclenche l'événement après la mesure, avec les trois champs pilotes en value1/2/3 (`sortieAvecPontIFTTT` dans `src/data/webhook-ifttt.js`, seule définition). Côté Node, le pont se déclenche même quand la sortie vient du cache ; côté Cloudflare, le cache de périphérie espace les déclenchements. La clé est un secret d'URL. Domaine à autoriser si on y touche en session cloud : `maker.ifttt.com`.

---

## Conventions de calcul

- **Angles** : degrés partout dans les interfaces, radians uniquement à l'intérieur des fonctions.
- **Azimut** : depuis le nord, sens horaire. 0 = N, 90 = E, 180 = S, 270 = O. Vaut pour le soleil comme pour l'orientation d'une surface.
- **Inclinaison** : 0 = horizontal, 90 = vertical.
- **Instants** : `Date` en interne, toujours absolus. Les horodatages « locaux » sont des chaînes `AAAA-MM-JJTHH:MM` dans le fuseau **du point mesuré**, jamais celui du serveur ni du navigateur.
- **La géométrie se calcule, le flux se demande.** La position du soleil est déterministe : ne jamais l'appeler par le réseau.

Modèles : NOAA basse précision (position), Haurwitz (ciel clair), Hay-Davies (diffus incliné), Erbs (décomposition de secours). Détail et justifications dans `docs/CALCUL.md`.

---

## Style visuel

Registre : instrument de mesure. Deux accents, deux sens — et c'est structurel, pas décoratif :

- `--flux` (ambre) = ce qui est **mesuré**, le rayonnement
- `--zenith` (cyan) = ce qui est **calculé**, la géométrie solaire

Polices : Archivo (titres), IBM Plex Mono (toute donnée chiffrée, avec chiffres tabulaires). Tokens dans `src/styles.css`. Ne pas introduire de troisième accent sans raison sémantique.

Accessibilité : chaque SVG porte un `aria-label` décrivant le résultat en clair, `prefers-reduced-motion` est respecté, le focus clavier reste visible.

---

## État des lieux

### Vérifié

206 tests hors ligne : position solaire recalée sur des repères astronomiques indépendants (solstices, midi solaire, hémisphère sud, soleil de minuit), physique du plan orienté, ensoleillement journalier (murs orientés, nuit polaire, soleil de minuit), seuils, sélection horaire, tracés SVG sans débordement, concordance prototype/modules, et les deux implémentations d'API.

### Non vérifié

- **Aucun appel réel à Open-Meteo.** Toutes les réponses sont simulées. La forme de la réponse vient de la documentation, pas d'une observation.
- **Page déployée, jamais visitée.** Le workflow `.github/workflows/pages.yml` a tourné avec succès le 04/08/2026 (run n° 1 : tests puis publication) : la page est en ligne sur `https://p54974348-ctrl.github.io/SunProbe/`. Elle n'a en revanche encore jamais été ouverte dans un navigateur — le réseau des sessions cloud ne joint pas `github.io`. Dérouler la checklist de fin de `docs/HEBERGEMENT.md` à la première occasion.

Ces deux points sont la première chose à traiter dans une session disposant du réseau vers `api.open-meteo.com` ou d'un accès aux réglages d'hébergement.

### Rendu visuel : vérifié le 04/08/2026 (Chromium headless, données simulées)

Page (accueil, mesure, formulaire, mobile 390 px) et prototype ouverts sous
Chromium via Playwright, polices réelles, Leaflet servi localement, réponses
Open-Meteo simulées avec le noyau du projet (triplets cohérents). Résultat :
aucune erreur console, aucune exception, page et prototype rendent des valeurs
identiques (58 / soleil faible sur le mur sud témoin). Un seul défaut trouvé et
corrigé : le libellé sous la boussole chevauchait la lettre cardinale « S »
(bande dédiée ajoutée dans `src/ui/boussole.js`). L'apparence sous un vrai
réseau (tuiles OSM réelles, données réelles) reste à confirmer.

### Pistes ouvertes

- **Masque d'horizon.** La limite la plus gênante en usage réel : la sonde ignore relief, immeubles, arbres et débords de toit. PVGIS (Centre commun de recherche européen) expose un profil d'horizon par coordonnées. L'appliquer reviendrait à annuler la composante directe quand le soleil passe sous ce profil.
- Prévision à quelques heures (« le soleil arrivera sur cette façade dans 40 min »), utile pour anticiper une fermeture de volet.
- Plusieurs surfaces en une seule requête, pour éviter un appel par façade.
- Historique et comparaison à la même date l'an passé (l'archive Open-Meteo remonte à 1940).

---

## Contexte de la source de données

Open-Meteo, gratuit, sans clé, CORS activé. Usage non commercial, moins de 10 000 appels/jour. **L'attribution CC BY 4.0 en pied de page est une condition de licence** — ne pas la retirer.

Depuis un navigateur, chaque visiteur consomme le quota sur sa propre IP. Depuis une fonction hébergée, tout part des mêmes adresses : c'est pourquoi `docs/HEBERGEMENT.md` recommande la page en ligne et l'API à la maison.
