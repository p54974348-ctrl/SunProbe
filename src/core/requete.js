/**
 * Lecture des paramètres d'une requête de sonde.
 *
 * Partagé par les deux implémentations de l'API (Node et Cloudflare) :
 * une règle de validation écrite deux fois finit toujours par diverger.
 * Fonction pure, sans dépendance HTTP — elle ne reçoit qu'un URLSearchParams.
 */

import { CONFIG } from '../config.js';

/**
 * Number(null) vaut 0 et Number('') vaut 0 : un paramètre absent
 * passerait pour la latitude 0. On refuse explicitement le vide.
 */
const nombreStrict = (v) => (v === null || v === undefined || String(v).trim() === '' ? NaN : Number(v));

const mod360 = (v) => ((v % 360) + 360) % 360;

/**
 * @param {URLSearchParams} params
 * @returns {{ok:true, valeurs:object} | {ok:false, erreur:object, statut:number}}
 */
export function lireParametres(params) {
  const refus = (erreur, statut = 400, extra = {}) => ({ ok: false, statut, erreur: { erreur, ...extra } });

  const latitude = nombreStrict(params.get('lat'));
  const longitude = nombreStrict(params.get('lon'));

  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) {
    return refus('Paramètre lat requis : latitude en degrés décimaux, entre -90 et 90.', 400, {
      exemple: '/api/v1/ensoleillement?lat=49.4431&lon=1.0993',
    });
  }
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180) {
    return refus('Paramètre lon requis : longitude en degrés décimaux, entre -180 et 180.', 400, {
      exemple: '/api/v1/ensoleillement?lat=49.4431&lon=1.0993',
    });
  }

  const at = params.get('at');
  if (at !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) {
    return refus('Format attendu pour at : AAAA-MM-JJTHH:MM, en heure locale du point.');
  }

  // --- Surface visée. Absente = plan horizontal, comportement d'origine. ---

  let inclinaisonDeg = CONFIG.surface.inclinaisonDeg;
  if (params.has('inclinaison')) {
    inclinaisonDeg = nombreStrict(params.get('inclinaison'));
    if (!Number.isFinite(inclinaisonDeg) || inclinaisonDeg < 0 || inclinaisonDeg > 90) {
      return refus(
        'Paramètre inclinaison : de 0 à 90 degrés. 0 = horizontal, 90 = vertical (mur, fenêtre).',
      );
    }
  }

  let orientationDeg = CONFIG.surface.orientationDeg;
  if (params.has('orientation')) {
    const brut = nombreStrict(params.get('orientation'));
    if (!Number.isFinite(brut)) {
      return refus(
        'Paramètre orientation : azimut de la surface en degrés depuis le nord, sens horaire. ' +
          '0 = nord, 90 = est, 180 = sud, 270 = ouest.',
      );
    }
    orientationDeg = mod360(brut);
  }

  let albedo = CONFIG.surface.albedo;
  if (params.has('albedo')) {
    albedo = nombreStrict(params.get('albedo'));
    if (!Number.isFinite(albedo) || albedo < 0 || albedo > 1) {
      return refus(
        'Paramètre albedo : réflectivité du sol entre 0 et 1. 0.2 herbe ou bitume, 0.6 neige fraîche.',
      );
    }
  }

  // --- Pont IFTTT, facultatif. Les deux paramètres vont ensemble. ---

  const iftttEvenement = params.get('ifttt_evenement');
  const iftttCle = params.get('ifttt_cle');
  if ((iftttEvenement === null) !== (iftttCle === null)) {
    return refus(
      'Les paramètres ifttt_evenement et ifttt_cle vont ensemble : ' +
        'l’un sans l’autre ne déclenche rien.',
    );
  }
  let ifttt = null;
  if (iftttEvenement !== null) {
    if (iftttEvenement.trim() === '' || iftttCle.trim() === '') {
      return refus('Paramètres ifttt_evenement et ifttt_cle : non vides quand ils sont fournis.');
    }
    ifttt = { evenement: iftttEvenement.trim(), cle: iftttCle.trim() };
  }

  return {
    ok: true,
    valeurs: { latitude, longitude, at, surface: { inclinaisonDeg, orientationDeg, albedo }, ifttt },
  };
}
