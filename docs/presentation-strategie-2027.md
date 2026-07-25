# Stratégie 2027 — Vision, produits & feuille de route

Transcription de la présentation Google Slides (version condensée, 10 diapositives,
créée le 24/07/2026) :
<https://docs.google.com/presentation/d/19lWyGF2eYvtp_gI55rnmO2RYVD3ZVfUDXNTo9clSWX4/edit>

Les champs entre crochets `[…]` restent à personnaliser.

---

## Diapositive 1 — Couverture

**Réunion de service — [DATE]**

# Stratégie 2027
Vision, produits & feuille de route

2026 → Cap 2027
[Nom du service]
[Prénom Nom · Fonction]

---

## Diapositive 2 — 01 · Vision & ambitions

### Notre vision à l'horizon 2027

> « Devenir d'ici 2027 la référence [de notre domaine] : des produits simples,
> fiables et utiles, au service de [nos clients / usagers]. »

*Formulation à ajuster collectivement en séance.*

- **Excellence opérationnelle** — Fiabiliser l'existant : qualité de service,
  délais maîtrisés, dette technique réduite.
- **Innovation utile** — Lancer de nouveaux produits à forte valeur, testés au
  plus près du terrain.
- **Proximité clients** — Faire de la satisfaction des utilisateurs la boussole
  de nos arbitrages.

---

## Diapositive 3 — 02 · Produits & projets : le portefeuille 2026–2027

| Statut | Élément | Description | Jalon |
|---|---|---|---|
| En production | Produit P1 | Politique produit en cours de déclinaison sur tout le périmètre. | CI/CD produit en T4 2026 |
| En production | Produit P2 | Même politique, même socle : 70 % de composants partagés avec P1. | CI/CD produit en T4 2026 |
| En migration | Socle de composants communs | ≈ 70 % des composants, mutualisés entre P1 et P2. | Socle migré en T2 2027 |
| En migration | Composants spécifiques | ≈ 30 % propres à chaque produit, migrés dans la continuité. | Fin de migration T3 2027 |
| En déploiement | Déclinaisons affaire P1 | Une déclinaison par affaire — les versions client — avec CI/CD dédiée. | 1res versions client T3 2027 |
| En cadrage | Déclinaisons affaire P2 | Versions client par affaire dès que possible, CI/CD spécifique. | 1res versions client T4 2027 |

---

## Diapositive 4 — 02 · Architecture & chaînes CI/CD

Architecture en quatre niveaux (du haut vers le bas) :

1. **Versions client** — déclinaisons par affaire pour P1 et P2 (Affaire 1, Affaire 2, …)
2. **Produits P1 / P2** — politique produit commune
3. **Composants spécifiques** P1 / P2 — ≈ 30 % chacun
4. **Socle de composants communs** — ≈ 70 % partagés, mutualisé entre P1 et P2,
   migré une seule fois vers le cloud B

**Chaînes CI/CD** (à définir par niveau, convergence des CI legacy) :

- CI/CD affaire · 1 par affaire
- CI/CD produit · P1 & P2
- CI/CD composants spécifiques
- CI/CD socle commun

> Ordre de migration : d'abord les composants (socle puis spécifiques), qui
> permettent de produire les sous-produits, puis enfin les versions client.
> Cible : cloud B — bascule depuis A finalisée en T1 2027.

---

## Diapositive 5 — 02 · Les chantiers de transformation

- **Modernisation des chaînes CI legacy** — Rénover l'existant et converger,
  niveau par niveau, vers les chaînes CI/CD cibles. → Convergence achevée fin 2027
- **Normalisation des processus de dév.** — Un référentiel commun — la politique
  software : cycle de vie, qualité, revues, dév. sécurisé. → Référentiel v1 en T4 2026
- **Migration cloud A → B** — Finalisation de la bascule des environnements et
  décommissionnement du cloud A. → Achevée en T1 2027
- **Migration des composants** — D'abord les composants (socle puis spécifiques),
  pour produire les sous-produits puis les versions client.
  → Socle T2 2027 · spécifiques T3 2027

---

## Diapositive 6 — 03 · Développement sécurisé : bonnes pratiques à chaque étape

*Chantier mené en autonomie.*

| Cadrage & conception | Développement | Tests & validation | Déploiement & run |
|---|---|---|---|
| Analyse de risques | Revue de code croisée | Tests dynamiques (DAST) | Durcissement des configs |
| Threat modeling | Analyse statique (SAST) | Test d'intrusion annuel | Supervision & alertes |
| Exigences de sécurité | Gestion des dépendances | Scans de vulnérabilités | Gestion des vulnérabilités |
| Revue d'architecture | Gestion des secrets | Revue avant mise en prod | Plan de réponse à incident |

> Des bonnes pratiques portées par la politique software : formation sécurité
> annuelle · un « security champion » par projet · référentiel d'exigences partagé.

---

## Diapositive 7 — 03 · Développement sécurisé : déploiement sur les 6 projets

Matrice projets × pratiques (statuts : En place / En cours / Planifié) :

- Pratiques suivies : threat modeling, revue de code · SAST, tests d'intrusion,
  supervision des vulnérabilités, formation de l'équipe.
- Projets couverts : Projet 1 à Projet 6. *(Statuts à renseigner.)*

> Cible : l'ensemble des bonnes pratiques en place sur les 6 projets d'ici
> fin 2027. Interface unique avec P1 · P2 : les composants.

---

## Diapositive 8 — 04 · Feuille de route : vue par couloirs

Période : T3 2026 → T4 2027. Couloirs :

- **Produit P1** — Politique produit · CI/CD P1, puis sous-produits (sur
  composants migrés), puis versions client.
- **Produit P2** — Politique produit · CI/CD P2, puis sous-produits, puis
  versions client.
- **Composants** — Migration du socle commun (70 %), puis composants
  spécifiques (30 %).
- **CI & processus** — Normalisation des processus, modernisation des chaînes
  CI legacy.
- **Transverse** — Migration cloud A → B, dév. sécurisé · extension.

---

## Diapositive 9 — 04 · Feuille de route : grandes phases & jalons clés

**Phase 1 · Consolider (S2 2026)**
- Décliner la politique produit P1 · P2
- Normaliser les processus de dév. (v1)
- Définir les chaînes CI/CD par niveau
- Poursuivre la migration des composants
- Lancer le socle de dév. sécurisé

**Phase 2 · Accélérer (S1 2027)**
- Finaliser la migration cloud A → B (T1)
- Achever la migration du socle commun
- Moderniser les chaînes CI legacy
- Produire les 1ers sous-produits P1 · P2
- Étendre le dév. sécurisé à 4 projets

**Phase 3 · Étendre (S2 2027)**
- Livrer les 1res versions client (P1, P2)
- Terminer les composants spécifiques
- Converger CI legacy → chaînes cibles
- Couvrir les 6 projets en sécurisé
- Préparer le cap 2028

**Jalons clés**

| Échéance | Jalon |
|---|---|
| T4 2026 | CI/CD cibles · référentiel v1 |
| T1 2027 | Fin migration cloud A → B |
| T2 2027 | Socle commun migré (70 %) |
| T4 2027 | Versions client · cap 2028 |

---

## Diapositive 10 — Et maintenant ? Prochaines étapes

1. **Aujourd'hui** — Valider la vision et la feuille de route ; recueillir les
   retours du service en séance.
2. **Septembre 2026** — Décliner en plans d'action ; un référent désigné par
   produit / projet.
3. **T4 2026** — Premier point d'étape trimestriel ; revue des jalons et de
   l'avancement des chantiers.

*Merci · place aux échanges — [prenom.nom@organisation.fr]*
