# Architecture

## Règle unique

Les dépendances descendent, jamais l'inverse.

```
        ┌──────────────┐   ┌──────────────────────┐
        │  index.html  │   │ server/sunprobe-api  │
        │ (navigateur) │   │       (Node)         │
        └──────┬───────┘   └──────────┬───────────┘
               │                      │
        ┌──────▼──────┐               │
        │   src/ui    │  DOM, SVG     │
        └──────┬──────┘               │
               │                      │
        ┌──────▼──────────────────────▼──────┐
        │            src/app.js               │  orchestration
        └──────┬──────────────────────┬───────┘
               │                      │
        ┌──────▼──────┐        ┌──────▼──────┐
        │  src/data   │ réseau │  src/core   │ calcul pur
        └─────────────┘        └─────────────┘
                    ┌─────────────┐
                    │ src/config  │
                    └─────────────┘
```

- `core` n'importe que `config`. Ni réseau, ni DOM, ni `window`.
- `data` n'importe que `config` et `http`. Aucun calcul solaire.
- `ui` n'importe que `core`. Aucun `fetch`.
- `sonde` enchaîne `data` puis `core`. Aucun DOM : c'est le pipeline commun aux trois points d'entrée — la page, le service Node et la fonction Cloudflare.
- `app` ajoute le formulaire et l'affichage par-dessus `sonde`.

Une conséquence utile : `core` et `data` tournent à l'identique dans le navigateur et dans Node. Le service domotique et la page web partagent le même code, donc la même définition de « plein soleil ». Il n'existe pas deux endroits où changer un seuil.

## Fichiers

```
SunProbe/
├── index.html                      page complète (nécessite un serveur HTTP)
├── prototype/
│   └── sunprobe-prototype.html     tout-en-un, double-clic, zéro installation
├── src/
│   ├── config.js                   seuils, échelles, endpoints — rien en dur ailleurs
│   ├── core/                       ── calcul pur, testable hors ligne
│   │   ├── solar-position.js       hauteur, azimut, déclinaison, équation du temps
│   │   ├── clear-sky.js            référence ciel clair, indice de clarté
│   │   ├── plan.js                 projection sur une surface inclinée et orientée
│   │   ├── score.js                score 0-100 et état — la seule définition
│   │   ├── requete.js              lecture et validation des paramètres d'API
│   │   └── sortie-domotique.js     contrat JSON versionné
│   ├── data/                       ── réseau, seul autorisé à fetch
│   │   ├── http.js                 délai d'attente, réessais, erreurs typées
│   │   ├── irradiance.js           adaptateur Open-Meteo
│   │   └── geocodage.js            texte ou coordonnées → point
│   ├── ui/                         ── DOM, seul autorisé à toucher la page
│   │   ├── rendu.js                relevé, mesures, messages
│   │   ├── courbe.js               graphique SVG de la journée
│   │   ├── boussole.js             vue de dessus : soleil contre orientation
│   │   └── carte.js                Leaflet, optionnel
│   ├── sonde.js                    pipeline partagé : données -> calcul -> sortie
│   ├── app.js                      orchestration de la page
│   └── styles.css
├── server/
│   └── sunprobe-api.mjs            service JSON pour Node, zéro dépendance
├── functions/
│   └── api/v1/ensoleillement.js    même API, portée sur Cloudflare Pages
├── tests/
│   ├── architecture.test.mjs       étanchéité des couches, seuils non codés en dur
│   ├── noyau.test.mjs              calcul solaire et seuils
│   ├── plan.test.mjs               physique du plan orienté
│   ├── courbe.test.mjs             tracé du graphique
│   ├── boussole.test.mjs           tracé de la boussole
│   ├── chaine.test.mjs             pipeline de bout en bout
│   ├── prototype.test.mjs          non-divergence prototype / modules
│   ├── cloudflare.test.mjs         fonction Pages
│   └── serveur.test.mjs            service Node
├── docs/
├── CLAUDE.md                       mémoire de projet, relue par Claude Code
├── .nojekyll                       neutralise Jekyll sur GitHub Pages
├── _headers                        en-têtes Cloudflare Pages / Netlify
└── netlify.toml
```

Le noyau ne dépendant d'aucun module Node, il tourne à l'identique dans trois environnements : le navigateur, Node, et l'isolat Workers de Cloudflare. Les deux implémentations de l'API (`server/` et `functions/`) ne diffèrent que par leur enveloppe HTTP.

## Changer de source de données

Réécrire `src/data/irradiance.js` en respectant sa forme de retour :

```js
{
  point: { latitude, longitude, altitude, fuseau, decalageUtcSec },
  serie: [ { local:"AAAA-MM-JJTHH:MM", instant:Date, ghi, dni, dhi, nuages } ]
}
```

Rien d'autre ne bouge : ni le score, ni la sortie domotique, ni l'affichage, ni les tests du noyau. Candidats plausibles : PVGIS (JRC), Solcast, Meteomatics, ou un pyranomètre local exposé en MQTT.

## Traitement des erreurs

Toute défaillance réseau devient une `ErreurReseau` avec un `message` rédigé pour être affiché tel quel, et une `cause` (`timeout`, `http`, `reseau`, `format`) pour décider du comportement.

- Les 4xx ne sont pas réessayés : la requête est fautive, insister n'aide pas.
- Les 5xx et les coupures le sont, avec un délai croissant.
- Une donnée horaire manquante ne fait pas échouer la mesure : le pas valide le plus proche est retenu et `fraicheur` passe à `approchee`.
- Si Leaflet ne se charge pas, le bloc carte disparaît et le reste fonctionne.

L'interface ne montre jamais de trace technique. `console.error` ne reçoit que les erreurs non prévues.

## Choix assumés

**Pas de compilateur, pas de bundler, pas de framework.** Modules ES natifs, servis tels quels. Le projet doit rester lisible et modifiable dans cinq ans par quelqu'un qui veut juste déplacer un seuil.

**Deux versions plutôt qu'une.** Le prototype existe pour être ouvert sans rien installer ; la version modulaire existe pour être maintenue. Ils partagent la logique mais pas le code, et c'est délibéré : ajouter une étape de compilation pour factoriser une centaine de lignes coûterait plus cher que la duplication.

Cette duplication est le point faible assumé de l'architecture, donc elle est surveillée : `tests/prototype.test.mjs` extrait le script du prototype, l'exécute avec un DOM factice et compare ses résultats numériques à ceux des modules sur 150 configurations. L'écart toléré est nul. Si les deux divergent, le test le dit, et `src/core` fait foi.

**Le calcul solaire est local.** Moins d'appels, pas de point de panne, et un résultat identique hors ligne.
