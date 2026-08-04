# Pousser sur GitHub

Le dépôt est déjà initialisé : branche `main`, remote `origin` configurée sur
`https://github.com/p54974348-ctrl/SunProbe.git`, et les 43 fichiers sont indexés.

Il reste deux commandes, à lancer depuis ce dossier.

```bash
git commit -m "SunProbe : sonde d'ensoleillement orientée"
git push -u origin main
```

Si Git demande qui tu es, règle-le une fois pour toutes avant de committer :

```bash
git config --global user.name "Ton Nom"
git config --global user.email "ton.email@exemple.fr"
```

## Authentification

GitHub n'accepte plus le mot de passe de compte en ligne de commande. Deux voies :

- **Jeton d'accès personnel** — le créer sur github.com dans Settings → Developer settings
  → Personal access tokens, avec la portée `repo`. Git le demandera à la place du mot de passe.
- **GitHub CLI** — `gh auth login` règle la question une fois pour toutes.

## Si le dépôt distant n'est plus vide

Le dépôt était vide au moment où ce projet a été préparé. Si quelque chose y a été
poussé depuis, `git push` sera refusé. Récupérer d'abord :

```bash
git pull --rebase origin main
git push -u origin main
```

## Vérifier après le push

- [ ] `CLAUDE.md` apparaît bien à la racine du dépôt sur github.com — c'est lui que
      Claude Code relit au début de chaque session.
- [ ] Le dépôt est **public** si tu comptes utiliser GitHub Pages gratuitement.
- [ ] Mise en ligne de la page : voir `docs/HEBERGEMENT.md`.
- [ ] Reprendre le travail depuis un navigateur ou un téléphone : voir `docs/REPRISE.md`.

Ce fichier peut être supprimé une fois le premier push effectué.
