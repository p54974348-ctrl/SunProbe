/**
 * Adaptateur de source de données : Open-Meteo Forecast API.
 *
 * Rôle unique : parler à l'API et rendre une série normalisée.
 * Aucun calcul solaire ici, aucun DOM. Pour changer de fournisseur,
 * on réécrit ce seul fichier en respectant la forme de retour ci-dessous.
 *
 * Retour :
 * {
 *   point:  { latitude, longitude, altitude, fuseau, decalageUtcSec },
 *   serie:  [ { instant: Date, local: "2026-07-25T14:00", ghi, dni, dhi, nuages } ],
 * }
 */

import { CONFIG } from '../config.js';
import { recupererJson, ErreurReseau } from './http.js';

const VARIABLES = [
  'shortwave_radiation', // GHI — global horizontal
  'direct_normal_irradiance', // DNI — direct sur plan perpendiculaire au soleil
  'diffuse_radiation', // DHI — diffus
  'cloud_cover',
];

const JOUR_MS = 86400000;

/**
 * Combien de jours passés / futurs demander pour couvrir la date visée.
 * @param {string} dateVisee "AAAA-MM-JJ"
 */
function fenetre(dateVisee) {
  const cible = Date.parse(`${dateVisee}T12:00:00Z`);
  const aujourdhui = Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00Z`);
  const ecart = Math.round((cible - aujourdhui) / JOUR_MS);

  return {
    passeJours: ecart < 0 ? Math.min(CONFIG.api.passeMaxJours, Math.abs(ecart) + 1) : 0,
    futurJours: Math.min(CONFIG.api.futurMaxJours, Math.max(2, ecart + 2)),
    horsPortee:
      ecart < -CONFIG.api.passeMaxJours || ecart > CONFIG.api.futurMaxJours - 1,
    ecartJours: ecart,
  };
}

/**
 * @param {object} p
 * @param {number} p.latitude
 * @param {number} p.longitude
 * @param {string} p.date  "AAAA-MM-JJ", interprétée en heure locale du point.
 */
export async function recupererIrradiance({ latitude, longitude, date }) {
  const f = fenetre(date);
  if (f.horsPortee) {
    throw new ErreurReseau(
      `Date hors de la portée de la source : ${CONFIG.api.passeMaxJours} jours en arrière, ` +
        `${CONFIG.api.futurMaxJours} jours en avant.`,
      'http',
      400,
    );
  }

  const url = new URL(CONFIG.api.irradiance);
  url.searchParams.set('latitude', latitude.toFixed(4));
  url.searchParams.set('longitude', longitude.toFixed(4));
  url.searchParams.set('hourly', VARIABLES.join(','));
  url.searchParams.set('timezone', 'auto'); // horodatages en heure locale du point
  url.searchParams.set('forecast_days', String(f.futurJours));
  if (f.passeJours > 0) url.searchParams.set('past_days', String(f.passeJours));

  const brut = await recupererJson(url);

  if (brut?.error) {
    throw new ErreurReseau(brut.reason || 'Requête refusée par la source.', 'http', 400);
  }
  const h = brut?.hourly;
  if (!h || !Array.isArray(h.time) || h.time.length === 0) {
    throw new ErreurReseau('La source n\'a renvoyé aucune donnée horaire.', 'format');
  }

  const decalage = Number(brut.utc_offset_seconds) || 0;

  const serie = h.time.map((local, i) => ({
    local, // "AAAA-MM-JJTHH:MM", heure locale du point
    instant: new Date(Date.parse(`${local}:00Z`) - decalage * 1000),
    ghi: nombreOuNull(h.shortwave_radiation?.[i]),
    dni: nombreOuNull(h.direct_normal_irradiance?.[i]),
    dhi: nombreOuNull(h.diffuse_radiation?.[i]),
    nuages: nombreOuNull(h.cloud_cover?.[i]),
  }));

  return {
    point: {
      latitude: brut.latitude ?? latitude,
      longitude: brut.longitude ?? longitude,
      altitude: brut.elevation ?? null,
      fuseau: brut.timezone ?? null,
      decalageUtcSec: decalage,
    },
    serie,
  };
}

const nombreOuNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Sélectionne le pas horaire couvrant l'instant demandé.
 *
 * Important : chez Open-Meteo, les variables de rayonnement sont des moyennes
 * sur l'heure PRÉCÉDANT l'horodatage. La valeur estampillée 14:00 décrit donc
 * l'intervalle ]13:00, 14:00]. On retient le premier pas dont l'horodatage
 * est >= à l'instant visé.
 *
 * @param {Array} serie
 * @param {string} localVise "AAAA-MM-JJTHH:MM" en heure locale du point
 */
export function selectionnerPas(serie, localVise) {
  const cible = Date.parse(`${localVise}:00Z`);
  let index = serie.findIndex((p) => Date.parse(`${p.local}:00Z`) >= cible);

  let fraicheur = 'ok';
  if (index === -1) {
    index = serie.length - 1;
    fraicheur = 'approchee';
  }

  const pas = serie[index];
  // Donnée manquante : on cherche le pas valide le plus proche.
  if (pas.ghi === null) {
    const secours = pasValideLePlusProche(serie, index);
    if (secours) return { pas: secours, fraicheur: 'approchee', index: serie.indexOf(secours) };
    return { pas: { ...pas, ghi: 0 }, fraicheur: 'indisponible', index };
  }

  return { pas, fraicheur, index };
}

function pasValideLePlusProche(serie, depart) {
  for (let d = 1; d <= 6; d++) {
    if (serie[depart - d]?.ghi !== null && serie[depart - d] !== undefined) return serie[depart - d];
    if (serie[depart + d]?.ghi !== null && serie[depart + d] !== undefined) return serie[depart + d];
  }
  return null;
}

/** Extrait les 24 pas d'une journée locale donnée, pour le graphique. */
export function serieDuJour(serie, date) {
  return serie.filter((p) => p.local.startsWith(date));
}
