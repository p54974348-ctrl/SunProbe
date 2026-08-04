# Mise en ligne

## Le point de départ

La page appelle Open-Meteo **directement depuis le navigateur**. Aucun serveur n'est nécessaire pour qu'elle fonctionne : n'importe quel hébergeur de fichiers statiques suffit, et tous les hébergeurs statiques gratuits conviennent.

Le service `server/sunprobe-api.mjs` est une pièce distincte, utile seulement si un automatisme domotique doit interroger la sonde. Cette distinction commande tout le reste du document.

| | Page web | API domotique |
|---|---|---|
| Besoin d'un serveur | non | oui |
| GitHub Pages | ✅ | ❌ |
| Cloudflare Pages | ✅ | ✅ via `functions/` |
| Chez soi (Raspberry Pi, NAS) | ✅ | ✅ |

---

## Option 1 — GitHub Pages

Le plus court chemin : le dépôt est déjà sur GitHub, aucun compte supplémentaire. Deux façons de publier, au choix.

**Par le workflow fourni — recommandé.** `.github/workflows/pages.yml` rejoue `npm test` puis publie la racine du dépôt à chaque poussée sur `main` : une régression ne part pas en ligne.

1. Dépôt → **Settings** → **Pages**.
2. *Source* : **GitHub Actions**. C'est tout — la prochaine poussée sur `main` publie (ou lancer le workflow à la main depuis l'onglet *Actions*).

**Par la branche — sans filet.** *Source* : **Deploy from a branch**, branche `main`, dossier `/ (root)`. Plus court encore, mais rien ne rejoue les tests avant la mise en ligne.

Résultat : `https://p54974348-ctrl.github.io/SunProbe/`

La page y est servie sous le sous-chemin `/SunProbe/` : tous les chemins du projet étant relatifs, elle fonctionne telle quelle — vérifié sous Chromium en servant le dépôt sous ce même préfixe.

Le fichier `.nojekyll` à la racine désactive le prétraitement Jekyll, qui n'a rien à faire ici et ignorerait certains fichiers.

**Ce qui fonctionne** : la page complète — carte, courbe, score, sortie JSON, lien partageable.
**Ce qui ne fonctionne pas** : la route `/api/v1/ensoleillement`. GitHub Pages ne sert que des fichiers ; il n'exécute aucun code côté serveur.

Le dépôt doit rester **public** pour que Pages soit gratuit. Les limites annoncées (taille du dépôt, bande passante mensuelle, fréquence de reconstruction) sont des limites souples largement au-dessus de l'usage d'un projet personnel ; se reporter à la documentation GitHub Pages pour les valeurs en vigueur.

---

## Option 2 — Cloudflare Pages : la page **et** l'API

Un seul hébergement pour les deux, sans machine à administrer et sans mise en veille.

Le dépôt se déploie par **les deux chemins** que propose le tableau de bord — la route `/api/v1/ensoleillement` est la même fonction dans les deux cas :

**Flux « Worker »** — celui que le tableau de bord met en avant. **Workers & Pages** → **Create** → connecter le dépôt `SunProbe`, rien à configurer : `wrangler.toml` décrit tout. `worker.js` route l'API vers la fonction existante et délègue le reste aux fichiers statiques ; `.assetsignore` écarte `node_modules` des fichiers publiés.

**Flux « Pages » classique** — onglet **Pages** → **Connect to Git** : *Framework preset* **None**, *Build command* **vide**, *Build output directory* `/`. Cloudflare détecte le dossier `functions/` et publie l'API automatiquement.

### En cas d'erreur au déploiement en flux Worker

- **« Asset too large » sur `node_modules/workerd` (122 Mio)** : le dépôt déployé ne porte pas encore `.assetsignore` — ce fichier n'est pas dans le dépôt, c'est l'outillage que Cloudflare vient d'installer. Mettre la branche déployée à jour, puis relancer.
- **« Missing entry-point to Worker script or to assets directory »** : le dépôt déployé ne porte pas encore `worker.js`/`wrangler.toml` avec `main` et `[assets]`. Même remède : déployer un `main` à jour.

```bash
curl 'https://sunprobe.pages.dev/api/v1/ensoleillement?lat=49.4431&lon=1.0993'
```

### Ce qu'il faut savoir sur le plan gratuit

- **Les fichiers statiques sont gratuits et illimités.** Une requête ne consomme du quota que si elle déclenche une fonction.
- **Les fonctions partagent le quota Workers gratuit : 100 000 requêtes par jour**, remis à zéro à minuit UTC.
- **10 ms de temps processeur par requête.** Le calcul de SunProbe est trivial (quelques dizaines d'opérations trigonométriques) et reste très en dessous. C'est pour préserver cette marge que la fenêtre de données demandée est réduite au strict nécessaire.
- La fonction met sa réponse en **cache de périphérie pendant 5 minutes**. Un automatisme qui sonde toutes les minutes ne déclenche donc qu'un appel réel toutes les cinq minutes.

### Fermer l'endpoint

Publié tel quel, `/api/v1/ensoleillement` accepte n'importe quelles coordonnées : n'importe qui peut s'en servir, et la consommation vous est imputée.

Dans **Settings** → **Variables and Secrets**, ajouter :

| Nom | Valeur |
|---|---|
| `POINTS_AUTORISES` | `49.44,1.10 ; 48.85,2.35` |

La fonction ne répondra plus que dans un rayon d'environ 5 km autour des points listés. Sans cette variable, aucune restriction ne s'applique.

---

## Option 2 bis — Google Apps Script : l'API seule, chez Google

Quand Cloudflare résiste, Google Apps Script est le chemin de repli le plus court pour une **API publique gratuite** — pas de compte supplémentaire si vous avez un compte Google, pas de carte bancaire, pas de serveur. Seule l'API y vit : la page reste sur GitHub Pages.

1. https://script.google.com → **Nouveau projet**.
2. Coller l'intégralité de `apps-script/sunprobe.gs` à la place du contenu.
3. **Déployer** → **Nouveau déploiement** → type **Application Web** : *Exécuter en tant que* **Moi**, *Accès* **Tout le monde**.
4. Copier l'URL `…/exec`. L'API répond sur `…/exec?lat=49.4431&lon=1.0993&orientation=329`, avec les mêmes paramètres et la même sortie que les autres API — pont IFTTT compris.

À savoir :

- Google répond par une **redirection 302** vers `googleusercontent.com` : le client doit la suivre (`curl -L` ; IFTTT et Home Assistant le font d'eux-mêmes).
- Pas de code de statut personnalisé : les erreurs reviennent en `200` avec un corps `{ "erreur": … }`.
- Quotas du compte gratuit : 20 000 appels sortants/jour, 90 min d'exécution/jour — très au-dessus d'un usage domotique. Le cache interne (5 min) ménage aussi le quota Open-Meteo.
- **Sonde programmée, sans applet « aller »** : renseigner les propriétés du script (`LAT`, `LON`, `ORIENTATION`, `INCLINAISON`, `IFTTT_EVENEMENT`, `IFTTT_CLE`, `IFTTT_EVENEMENT_ETAT`, `NTFY_SUJET`) puis ajouter un déclencheur horaire sur `sondeProgrammee`. La mesure part vers IFTTT toutes les heures et la clé ne circule dans aucune URL.
- **Plusieurs sondes** : la propriété `SONDES` accepte un tableau JSON, une entrée par surface — `[{"nom":"facade_no","lat":49.54,"lon":1.10,"orientation":333}, …]`. Sept façades du même point ne coûtent qu'un appel à la source par mesure ; mémoire d'état, notification ntfy et événements IFTTT sont tenus **par sonde** (`sonde_facade_no_plein_soleil`…).
- Ce fichier duplique le noyau (Apps Script n'accepte pas les modules ES) : `tests/apps-script.test.mjs` garantit qu'il ne diverge pas des modules, comme pour le prototype.

### La chaîne 100 % gratuite

Chaque maillon a une version sans le moindre coût ni carte bancaire :

| Besoin | Brique gratuite |
|---|---|
| La page web | GitHub Pages |
| L'API JSON publique | Apps Script (`doGet`) |
| Mesurer toutes les heures | Déclencheur horaire Apps Script (`sondeProgrammee`) |
| Notification mobile | Propriété `NTFY_SUJET` — [ntfy.sh](https://ntfy.sh), gratuit et sans compte : installer l'appli ntfy et s'abonner au même sujet |
| Piloter un objet connecté | Pont IFTTT (2 applets gratuites) ou Home Assistant local |
| Question en langage naturel | Dialogflow ES, gratuit en texte (ci-dessous) |

La notification ntfy ne part qu'**au changement d'état** (`plein soleil` → `ombre`…) : mémoire par sonde dans `ETAT_PRECEDENT[_nom]`, pas d'alerte horaire répétitive — et pas besoin du tri payant d'IFTTT Pro. Le sujet ntfy est public par nature : en choisir un long et impossible à deviner (ex. `sonde-facade-x7k2m9`), sans y mettre de secret.

### Agent Dialogflow ES : demander l'ensoleillement en langage naturel

La même URL `…/exec` sert de **webhook de fulfillment** : l'agent comprend la question, la sonde mesure et répond une phrase (« Sur le mur orienté NNO (333°) : soleil faible, score 38 sur 100… »).

1. Prérequis : les propriétés du script `LAT`, `LON`, `ORIENTATION` sont renseignées (voir plus haut) — l'agent parle de *votre* façade.
2. [dialogflow.cloud.google.com](https://dialogflow.cloud.google.com) → **Create Agent** — nom libre, langue **français**.
3. **Fulfillment** (menu de gauche) → **Webhook** : *Enabled*, *URL* = votre `…/exec`, rien d'autre → **Save**.
4. **Intents** → **Create Intent**, nom `Ensoleillement` :
   - *Training phrases* : « quel est l'ensoleillement de la façade ? », « y a-t-il du soleil sur le mur ? », « la façade est-elle au soleil ? », « c'est ensoleillé ? »…
   - Tout en bas, *Fulfillment* → **Enable webhook call for this intent** → **Save**.
5. Tester dans le panneau de droite (« Try it now ») : taper une des phrases, la réponse de la sonde apparaît.
6. Facultatif — viser une autre orientation à la voix : dans l'intention, ajouter un paramètre `orientation` (entité `@sys.number`, non requis) et des phrases du type « quel est l'ensoleillement du mur à 180 degrés ? ». Le paramètre prime alors sur la propriété `ORIENTATION`.

Pour l'exposer : l'onglet **Integrations** propose notamment **Dialogflow Messenger**, un widget de discussion à coller dans n'importe quelle page web. À savoir : depuis 2023, Google a fermé le pont Dialogflow → Google Assistant — un agent ES ne se pilote plus à la voix depuis un Google Home ; pour déclencher la domotique, le chemin reste le pont IFTTT ci-dessus.

Le webhook doit répondre en moins de 5 secondes : la mesure directe en prend bien moins, même sans cache.

## Option 3 — Netlify, Vercel, autres

Le fichier `netlify.toml` est fourni : *publish directory* `.`, aucune commande de construction. Le glisser-déposer du dossier sur `app.netlify.com/drop` fonctionne aussi, sans compte Git.

Vercel : importer le dépôt, *Framework Preset* **Other**, laisser les commandes vides.

Dans les deux cas, seule la partie statique est déployée. Pour y ajouter l'API, il faut porter `functions/api/v1/ensoleillement.js` vers le format de la plateforme — `netlify/functions/` ou `api/`. Le corps de la fonction est réutilisable presque tel quel : elle n'utilise que `fetch`, `URL` et `Response`, disponibles partout.

**Éviter** les hébergeurs dont l'offre gratuite met l'application en veille après quelques minutes d'inactivité. Un automatisme qui interroge la sonde toutes les cinq minutes réveillerait le service à chaque fois, avec plusieurs secondes d'attente — inutilisable en pratique.

---

## Option 4 — Chez soi, pour la domotique

**C'est l'option à préférer si l'API sert un automatisme.** Trois raisons :

1. **Votre installation ne dépend plus d'un service extérieur.** Une coupure chez l'hébergeur ne doit pas décider de la position de vos volets.
2. **Vos coordonnées ne sont pas publiées.** Une URL publique contenant `lat` et `lon` indique où vous habitez.
3. **Le quota Open-Meteo reste le vôtre.** Depuis un navigateur, chaque visiteur consomme sur sa propre adresse IP. Depuis une fonction hébergée, tous les appels partent des mêmes adresses, et le plafond se rapproche vite.

Sur un Raspberry Pi, un NAS ou la machine qui fait tourner Home Assistant :

```bash
git clone https://github.com/p54974348-ctrl/SunProbe.git /opt/sunprobe
cd /opt/sunprobe
node server/sunprobe-api.mjs
```

Le fichier de service systemd est dans [DOMOTIQUE.md](DOMOTIQUE.md). Rien à ouvrir sur la box : le service reste sur le réseau local.

La combinaison la plus saine est donc souvent **la page sur GitHub Pages, l'API à la maison**.

---

## Quotas Open-Meteo

Les conditions du service gratuit : usage non commercial, moins de 10 000 appels par jour, 5 000 par heure, 600 par minute. Un projet personnel sans publicité ni abonnement entre dans le cadre non commercial.

Une requête SunProbe demande 4 variables sur quelques jours : elle compte pour un appel.

**L'attribution CC BY 4.0 est obligatoire.** Le pied de page de `index.html` la porte déjà ; la retirer serait une violation de licence.

---

## Nom de domaine

GitHub Pages comme Cloudflare Pages acceptent un domaine personnalisé gratuitement, avec certificat HTTPS automatique — seul le domaine lui-même est payant.

- GitHub Pages : **Settings** → **Pages** → *Custom domain*, puis un enregistrement `CNAME` vers `<utilisateur>.github.io`.
- Cloudflare Pages : **Custom domains** → *Set up a domain*. Immédiat si le domaine est déjà sur Cloudflare.

---

## Vérifier après mise en ligne

- [ ] La page s'ouvre et affiche le formulaire.
- [ ] Une mesure sur « Rouen » renvoie un score cohérent avec la météo du moment.
- [ ] La carte s'affiche et un clic dessus lance une mesure.
- [ ] Le graphique de la journée se trace.
- [ ] Le lien partageable, ouvert dans un autre onglet, relance la même mesure.
- [ ] Sur mobile, la mise en page passe en une colonne.
- [ ] Le pied de page mentionne toujours Open-Meteo et OpenStreetMap.
- [ ] Si vous avez déployé l'API : `curl` renvoie du JSON, et un second appel dans la minute est servi par le cache.
