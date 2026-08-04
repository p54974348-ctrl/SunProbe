# Reprendre le travail ailleurs

Une conversation ne se transporte pas : le contexte d'une session ne suit pas. Ce qui suit, c'est **le dépôt**. `CLAUDE.md` à la racine tient lieu de mémoire — conventions, pièges déjà rencontrés, état des lieux, pistes ouvertes — et il est relu au début de chaque session.

---

## Prérequis : le dépôt doit être sur GitHub

Les sessions cloud clonent depuis GitHub. Rien ne fonctionne tant que le code n'y est pas.

```bash
cd SunProbe
git init
git add .
git commit -m "SunProbe : sonde d'ensoleillement orientée"
git branch -M main
git remote add origin https://github.com/p54974348-ctrl/SunProbe.git
git push -u origin main
```

Vérifier ensuite que `CLAUDE.md` apparaît bien à la racine du dépôt sur github.com.

---

## Travailler depuis un navigateur ou un téléphone

Sur **claude.ai/code**, connecter le compte GitHub, choisir le dépôt `SunProbe`, décrire la tâche.

La session tourne sur l'infrastructure d'Anthropic, dans un environnement isolé, et survit à la fermeture du navigateur. Elle se suit depuis l'application mobile. À la fin, les changements sont poussés sur une branche et une pull request est ouverte ; l'environnement d'exécution, lui, est détruit.

Conséquences pratiques :

- **Rien ne persiste hors du dépôt.** Une note utile pour la suite doit être écrite dans un fichier versionné, pas laissée dans la conversation.
- **Le travail arrive en pull request**, pas directement sur `main`. C'est un filet : on relit avant de fusionner.
- **Le quota est partagé** avec le reste de l'usage Claude. Plusieurs tâches en parallèle consomment d'autant.

### Accès réseau

Par défaut, la session ne joint pas n'importe quel domaine. Pour SunProbe :

| Besoin | Domaines |
|---|---|
| Tests (`npm test`) | **aucun** — tout est simulé |
| Appels réels à la source | `api.open-meteo.com`, `geocoding-api.open-meteo.com` |
| `npm run serve` | registre npm, couvert par le mode « Trusted » |

La suite de tests tournant entièrement hors ligne, la majorité des tâches n'a besoin d'aucune ouverture.

---

## Revenir sur un poste

Depuis le dossier du dépôt cloné :

```bash
npm test        # doit afficher 195 PASS et 0 ECHEC
npm run serve   # http://localhost:5173
```

Aucune installation de dépendances : il n'y en a pas.

Claude Code en terminal permet aussi de rapatrier une session web en cours pour la continuer localement, à condition d'être authentifié sur le même compte.

---

## Bien formuler une tâche

Le dépôt est petit mais dense. Une demande vague produit un patch vague.

**Peu efficace** — « améliore le calcul solaire ».

**Efficace** — « Ajoute un masque d'horizon depuis l'API PVGIS : nouveau module `src/core/horizon.js`, annule la composante directe quand le soleil passe sous le profil, garde diffus et sol. Étends `src/core/plan.js` et ajoute les tests. Respecte l'étanchéité des couches décrite dans CLAUDE.md et répercute dans le prototype. »

Rappels utiles à glisser dans une consigne :

- `npm test` doit passer, sans supprimer de test existant ;
- toute modification de `src/core/plan.js`, `solar-position.js` ou `clear-sky.js` se répercute dans `prototype/sunprobe-prototype.html` ;
- un changement de sens d'un champ de sortie impose d'incrémenter `version` ;
- pas de dépendance de production nouvelle sans justification.

---

## Le premier réflexe utile

Trois choses n'ont jamais pu être vérifiées faute de navigateur et de réseau : **le rendu visuel de la page, un appel réel à Open-Meteo, un déploiement.** Une session disposant de l'un des trois devrait commencer par là. La checklist de vérification après mise en ligne est en fin de `HEBERGEMENT.md`.
