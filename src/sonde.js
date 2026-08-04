/**
 * Pipeline de sonde — données -> calcul -> sortie.
 *
 * Partagé par les trois points d'entrée : la page, le service Node et la
 * fonction Cloudflare. Chacun ne garde que son enveloppe (formulaire ou HTTP).
 */

import { positionSolaire } from './core/solar-position.js';
import { evaluer } from './core/score.js';
import { ensoleillementJournalier } from './core/ensoleillement.js';
import { construireSortie } from './core/sortie-domotique.js';
import { recupererIrradiance, selectionnerPas, serieDuJour } from './data/irradiance.js';

/**
 * @param {object} demande
 * @param {number} demande.latitude
 * @param {number} demande.longitude
 * @param {string|null} [demande.at]  "AAAA-MM-JJTHH:MM" en heure locale du point.
 *                                    Absent = maintenant, dans le fuseau du point.
 * @param {{inclinaisonDeg?:number, orientationDeg?:number, albedo?:number}} [demande.surface]
 * @param {string} [demande.libelle]
 * @returns {Promise<{sortie:object, serieJour:Array, indexJour:number, point:object}>}
 */
export async function sonder({ latitude, longitude, at = null, surface = {}, libelle = null }) {
  const date = at ? at.slice(0, 10) : new Date().toISOString().slice(0, 10);

  const { point, serie } = await recupererIrradiance({ latitude, longitude, date });

  // Sans horodatage explicite, « maintenant » s'entend dans le fuseau du point,
  // pas dans celui du serveur ni du navigateur.
  const localVise =
    at ?? new Date(Date.now() + point.decalageUtcSec * 1000).toISOString().slice(0, 16);

  const { pas, fraicheur } = selectionnerPas(serie, localVise);

  // L'instant évalué est celui demandé, pas l'estampille du pas horaire.
  const instant = new Date(Date.parse(`${localVise}:00Z`) - point.decalageUtcSec * 1000);
  const geometrie = positionSolaire(instant, point.latitude, point.longitude);

  const evaluation = evaluer({
    ghi: pas.ghi,
    dni: pas.dni,
    dhi: pas.dhi,
    hauteurDeg: geometrie.hauteur,
    azimutDeg: geometrie.azimut,
    nuages: pas.nuages,
    instant,
    surface,
  });

  const jourLocal = localVise.slice(0, 10);
  const jour = serieDuJour(serie, jourLocal);

  const ensoleillement = ensoleillementJournalier({
    serieJour: jour,
    latitude: point.latitude,
    longitude: point.longitude,
    surface: evaluation.surface,
  });

  const sortie = construireSortie({
    point: { ...point, libelle },
    instant,
    instantLocal: localVise,
    fuseau: point.fuseau,
    evaluation,
    mesures: { ghi: pas.ghi, dni: pas.dni, dhi: pas.dhi, nuages: pas.nuages },
    geometrie,
    ensoleillement,
    fraicheur,
  });

  return { sortie, serieJour: jour, indexJour: jour.indexOf(pas), point };
}
