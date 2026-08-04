/**
 * Ensoleillement journalier — part du jour pendant laquelle une surface
 * reçoit le soleil direct, pour une orientation donnée.
 *
 * « Recevoir le soleil » exige deux choses à la fois :
 *   - un faisceau assez fort : DNI au moins égal au seuil OMM
 *     (`CONFIG.ensoleillement.seuilDirectWm2`) — en dessous, pas d'ombre nette ;
 *   - le soleil devant la face : incidence < 90°. Pour un plan horizontal,
 *     cette condition se réduit à « soleil levé ».
 *
 * Le pourcentage rapporte les heures ainsi ensoleillées aux heures où le
 * soleil est levé : un mur nord à 0 % et un mur sud à 85 % se comparent donc
 * sur la même journée. En nuit polaire, il n'y a pas de jour : le pourcentage
 * vaut `null`, pas 0.
 *
 * Piège n° 1 du projet : chaque pas horaire moyenne l'heure PRÉCÉDANT son
 * estampille. La géométrie solaire est donc évaluée au MILIEU de l'intervalle,
 * seul instant représentatif du pas entier.
 */

import { CONFIG } from '../config.js';
import { positionSolaire } from './solar-position.js';
import { incidence } from './plan.js';

const DEMI_HEURE_MS = 1800000;

/**
 * @param {object} p
 * @param {Array<{instant:Date, dni:number|null}>} p.serieJour Pas horaires du jour local.
 * @param {number} p.latitude
 * @param {number} p.longitude
 * @param {{inclinaisonDeg?:number, orientationDeg?:number}} [p.surface]
 * @returns {{pourcentage:number|null, dureeSoleilH:number, dureeJourH:number}}
 */
export function ensoleillementJournalier({ serieJour, latitude, longitude, surface = {} }) {
  const inclinaisonDeg = surface.inclinaisonDeg ?? 0;
  const orientationDeg = surface.orientationDeg ?? 180;

  let dureeJourH = 0;
  let dureeSoleilH = 0;

  for (const pas of serieJour) {
    const milieu = new Date(pas.instant.getTime() - DEMI_HEURE_MS);
    const { hauteur, azimut } = positionSolaire(milieu, latitude, longitude);
    if (hauteur <= 0) continue;
    dureeJourH++;

    if ((pas.dni ?? 0) < CONFIG.ensoleillement.seuilDirectWm2) continue;
    if (incidence(hauteur, azimut, inclinaisonDeg, orientationDeg).cosTheta > 0) dureeSoleilH++;
  }

  return {
    pourcentage: dureeJourH === 0 ? null : Math.round((dureeSoleilH / dureeJourH) * 100),
    dureeSoleilH,
    dureeJourH,
  };
}
