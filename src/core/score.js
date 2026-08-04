/**
 * Score d'ensoleillement et état domotique.
 *
 * Fonction pure : mêmes entrées -> mêmes sorties, aucun effet de bord,
 * aucun accès réseau. C'est le seul endroit où « plein soleil » est défini.
 *
 * Le score porte sur la **surface demandée**. Sans inclinaison, la surface
 * est le plan horizontal et le comportement est celui d'origine.
 */

import { CONFIG } from '../config.js';
import { ghiCielClair, indiceCielClair } from './clear-sky.js';
import { irradianceSurPlan, completerComposantes } from './plan.js';

/** États possibles, du plus lumineux au plus sombre. */
export const ETATS = /** @type {const} */ ({
  PLEIN_SOLEIL: 'plein soleil',
  SOLEIL_FAIBLE: 'soleil faible',
  OMBRE: 'ombre',
  NUIT: 'nuit',
});

/**
 * @param {object} entree
 * @param {number} entree.ghi          Irradiance globale horizontale prévue, W/m².
 * @param {number} [entree.dni]        Irradiance directe normale, W/m².
 * @param {number} [entree.dhi]        Irradiance diffuse horizontale, W/m².
 * @param {number} entree.hauteurDeg   Hauteur du soleil, degrés.
 * @param {number} [entree.azimutDeg]  Azimut du soleil, degrés depuis le nord.
 * @param {number} [entree.nuages]     Couverture nuageuse, %.
 * @param {Date}   [entree.instant]    Requis dès que la surface est inclinée.
 * @param {{inclinaisonDeg?:number, orientationDeg?:number, albedo?:number}} [entree.surface]
 * @param {object} [reglages]          Surcharge de CONFIG.score (tests, réglage fin).
 */
export function evaluer(
  { ghi, dni, dhi, hauteurDeg, azimutDeg = 180, nuages, instant, surface = {} },
  reglages = CONFIG.score,
) {
  const { ghiPleineEchelle, seuils, hauteurNuitDeg } = reglages;

  const inclinaisonDeg = surface.inclinaisonDeg ?? CONFIG.surface.inclinaisonDeg;
  const orientationDeg = surface.orientationDeg ?? CONFIG.surface.orientationDeg;
  const albedo = surface.albedo ?? CONFIG.surface.albedo;

  const ghiClair = ghiCielClair(hauteurDeg);
  // La clarté qualifie le CIEL, pas la surface : elle reste rapportée
  // à l'horizontale, quelle que soit l'orientation demandée.
  const kc = indiceCielClair(ghi, ghiClair);

  const horodatage = instant instanceof Date ? instant : new Date();
  const composantes = completerComposantes({ ghi, dni, dhi, hauteurDeg, instant: horodatage });

  const plan = irradianceSurPlan({
    ...composantes,
    hauteurDeg,
    azimutSoleilDeg: azimutDeg,
    inclinaisonDeg,
    orientationDeg,
    albedo,
    instant: horodatage,
  });

  const base = {
    surface: { inclinaisonDeg, orientationDeg, albedo },
    irradianceSurface: Math.round(plan.poa),
    composantesSurface: {
      direct: Math.round(plan.direct),
      diffus: Math.round(plan.diffus),
      sol: Math.round(plan.sol),
    },
    angleIncidenceDeg: Number(plan.angleIncidenceDeg.toFixed(2)),
    ghiCielClair: Math.round(ghiClair),
    indiceCielClair: kc === null ? null : Number(kc.toFixed(3)),
    composantesEstimees: composantes.estime,
    hauteurDeg,
    nuages: nuages ?? null,
  };

  // Nuit : le score est nul par construction, quelle que soit la donnée réseau.
  if (hauteurDeg <= hauteurNuitDeg) {
    return {
      ...base,
      score: 0,
      etat: ETATS.NUIT,
      soleilDirect: false,
      irradianceSurface: 0,
      composantesSurface: { direct: 0, diffus: 0, sol: 0 },
      ghiCielClair: 0,
      indiceCielClair: null,
    };
  }

  const score = Math.round(100 * Math.min(1, Math.max(0, plan.poa) / ghiPleineEchelle));

  let etat;
  if (score >= seuils.pleinSoleil) etat = ETATS.PLEIN_SOLEIL;
  else if (score >= seuils.soleilFaible) etat = ETATS.SOLEIL_FAIBLE;
  else etat = ETATS.OMBRE;

  return { ...base, score, etat, soleilDirect: plan.soleilDirect };
}
