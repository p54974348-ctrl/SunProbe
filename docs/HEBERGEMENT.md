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

1. Créer un compte Cloudflare (gratuit), aller dans **Workers & Pages** → **Create** → onglet **Pages** → **Connect to Git**. **Bien choisir « Pages », pas « Worker »** — le tableau de bord met les Workers en avant, mais un Worker ne sert pas le dossier `functions/` et le déploiement échoue (voir l'encadré ci-dessous).
2. Sélectionner le dépôt `SunProbe`. Le fichier `wrangler.toml` à la racine décrit déjà le projet : racine publiée telle quelle, aucune commande de construction.
3. Si le formulaire pose les questions malgré tout : *Framework preset* **None**, *Build command* **vide**, *Build output directory* `/`.
4. Déployer.

Cloudflare détecte automatiquement le dossier `functions/` et publie `functions/api/v1/ensoleillement.js` sur la route `/api/v1/ensoleillement`.

### En cas d'erreur « Asset too large » au déploiement

Le symptôme : `We found a file /opt/buildhome/repo/node_modules/workerd/bin/workerd with a size of 122 MiB` (la limite est 25 Mio). Ce fichier n'est pas dans le dépôt : c'est l'outillage que Cloudflare vient d'installer. Ce message signifie que le projet a été créé comme **Worker** : Cloudflare installe alors `wrangler` dans `node_modules`, puis tente de publier tout le dépôt — `node_modules` compris — comme fichiers statiques.

Remède : supprimer ce projet et le recréer en **Pages** (étapes ci-dessus). En Pages, `node_modules` est ignoré d'office et l'API fonctionne.

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
