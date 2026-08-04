/**
 * Irradiance sur un plan orienté — calcul local, aucune dépendance.
 *
 * Les données météo décrivent un plan **horizontal**. Une façade, une fenêtre
 * ou un panneau ne reçoivent pas la même chose : tout dépend de l'angle entre
 * le rayon solaire et la normale à la surface.
 *
 * Conventions, identiques à celles de solar-position.js :
 *   inclinaison  0° = horizontal (regarde le ciel), 90° = vertical (mur)
 *   orientation  azimut de la normale, depuis le nord, sens horaire
 *                0 = N, 90 = E, 180 = S, 270 = O
 *                Sans effet quand l'inclinaison vaut 0.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const borner = (v, min, max) => Math.min(max, Math.max(min, v));

/** Constante solaire corrigée de la distance Terre-Soleil du jour. */
export function irradianceExtraterrestre(instant) {
  const debut = Date.UTC(instant.getUTCFullYear(), 0, 1);
  const jour = Math.floor((instant.getTime() - debut) / 86400000) + 1;
  return 1361 * (1 + 0.033 * Math.cos((2 * Math.PI * jour) / 365));
}

/**
 * Cosinus de l'angle d'incidence entre le rayon solaire et la normale au plan.
 *
 *   cos θ = sin(h)·cos(β) + cos(h)·sin(β)·cos(γs − γc)
 *
 * Négatif quand le soleil passe derrière le plan : une façade nord à midi
 * ne reçoit alors plus aucun rayonnement direct, seulement du diffus.
 */
export function incidence(hauteurDeg, azimutSoleilDeg, inclinaisonDeg, orientationDeg) {
  const h = hauteurDeg * DEG;
  const b = inclinaisonDeg * DEG;
  const ecartAzimut = (azimutSoleilDeg - orientationDeg) * DEG;

  const cosTheta = Math.sin(h) * Math.cos(b) + Math.cos(h) * Math.sin(b) * Math.cos(ecartAzimut);

  return {
    cosTheta: borner(cosTheta, -1, 1),
    angleDeg: Math.acos(borner(cosTheta, -1, 1)) * RAD,
  };
}

/**
 * Corrélation d'Erbs : sépare le rayonnement global horizontal en une part
 * diffuse et une part directe. Filet de sécurité quand la source ne fournit
 * pas DNI et DHI ; les valeurs mesurées sont toujours préférées.
 */
export function completerComposantes({ ghi, dni, dhi, hauteurDeg, instant }) {
  const sinH = Math.sin(hauteurDeg * DEG);
  if (!Number.isFinite(ghi) || sinH <= 0.02) {
    return { ghi: ghi ?? 0, dni: dni ?? 0, dhi: dhi ?? Math.max(0, ghi ?? 0), estime: false };
  }
  if (Number.isFinite(dni) && Number.isFinite(dhi)) return { ghi, dni, dhi, estime: false };

  const e0 = irradianceExtraterrestre(instant);
  const kt = borner(ghi / (e0 * sinH), 0, 1);

  let fractionDiffuse;
  if (kt <= 0.22) fractionDiffuse = 1 - 0.09 * kt;
  else if (kt <= 0.8)
    fractionDiffuse =
      0.9511 - 0.1604 * kt + 4.388 * kt ** 2 - 16.638 * kt ** 3 + 12.336 * kt ** 4;
  else fractionDiffuse = 0.165;

  const dhiEstime = Number.isFinite(dhi) ? dhi : ghi * borner(fractionDiffuse, 0, 1);
  const dniEstime = Number.isFinite(dni) ? dni : Math.max(0, (ghi - dhiEstime) / sinH);

  return { ghi, dni: dniEstime, dhi: dhiEstime, estime: true };
}

/**
 * Irradiance totale reçue par le plan, en W/m².
 *
 * Trois contributions :
 *   direct  — le faisceau solaire, projeté sur la surface  (modèle géométrique)
 *   diffus  — la voûte céleste                             (modèle de Hay-Davies)
 *   sol     — la réflexion du sol devant la surface        (modèle isotrope)
 *
 * Hay-Davies pondère le diffus par un indice d'anisotropie : par ciel clair,
 * une bonne part du diffus vient d'autour du soleil, et suit donc le faisceau
 * direct plutôt que d'être répartie sur tout le ciel. Un modèle isotrope
 * sous-estimerait nettement une surface tournée vers le soleil.
 *
 * @param {object} p
 * @param {number} p.ghi, p.dni, p.dhi   W/m², plan horizontal
 * @param {number} p.hauteurDeg, p.azimutSoleilDeg
 * @param {number} p.inclinaisonDeg, p.orientationDeg
 * @param {number} [p.albedo]  Réflectivité du sol. 0.2 herbe/bitume, 0.6 neige fraîche.
 * @param {Date}   p.instant
 */
export function irradianceSurPlan({
  ghi,
  dni,
  dhi,
  hauteurDeg,
  azimutSoleilDeg,
  inclinaisonDeg = 0,
  orientationDeg = 180,
  albedo = 0.2,
  instant,
}) {
  const { cosTheta, angleDeg } = incidence(
    hauteurDeg,
    azimutSoleilDeg,
    inclinaisonDeg,
    orientationDeg,
  );
  const soleilLeve = hauteurDeg > 0;
  const soleilDirect = soleilLeve && cosTheta > 0;

  // Plan horizontal : la mesure EST déjà la grandeur voulue.
  // On ne la reconstruit pas à partir de ses composantes, ce qui
  // introduirait un écart là où la source est déjà exacte.
  if (inclinaisonDeg === 0) {
    return {
      poa: Math.max(0, ghi ?? 0),
      direct: soleilLeve ? Math.max(0, (dni ?? 0) * Math.sin(hauteurDeg * DEG)) : 0,
      diffus: Math.max(0, dhi ?? 0),
      sol: 0,
      cosTheta,
      angleIncidenceDeg: angleDeg,
      soleilDirect,
    };
  }

  const b = inclinaisonDeg * DEG;
  const facteurCiel = (1 + Math.cos(b)) / 2; // part de voûte céleste vue
  const facteurSol = (1 - Math.cos(b)) / 2; // part de sol vue

  const direct = soleilDirect ? (dni ?? 0) * cosTheta : 0;

  // Rapport direct : projection du faisceau sur le plan rapportée à l'horizontale.
  // Le cosinus zénithal est borné pour éviter la divergence près de l'horizon.
  const cosZenith = Math.max(0.02, Math.sin(hauteurDeg * DEG));
  const rapportDirect = soleilLeve ? Math.max(0, cosTheta) / cosZenith : 0;

  const e0 = irradianceExtraterrestre(instant);
  const anisotropie = soleilLeve ? borner((dni ?? 0) / e0, 0, 1) : 0;

  const diffus =
    Math.max(0, dhi ?? 0) * (anisotropie * rapportDirect + (1 - anisotropie) * facteurCiel);

  const sol = Math.max(0, ghi ?? 0) * albedo * facteurSol;

  return {
    poa: Math.max(0, direct + diffus + sol),
    direct: Math.max(0, direct),
    diffus: Math.max(0, diffus),
    sol: Math.max(0, sol),
    cosTheta,
    angleIncidenceDeg: angleDeg,
    soleilDirect,
  };
}
