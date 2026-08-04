/**
 * Géocodage : transformer un texte saisi en couple (latitude, longitude).
 *
 * Deux chemins, dans cet ordre :
 *   1. la saisie ressemble déjà à des coordonnées -> on les lit, aucun appel réseau ;
 *   2. sinon -> API de géocodage Open-Meteo.
 */

import { CONFIG } from '../config.js';
import { recupererJson, ErreurReseau } from './http.js';

/**
 * Reconnaît "49.4431, 1.0993", "49.4431 1.0993", "49,4431 / 1,0993".
 * @returns {{latitude:number, longitude:number}|null}
 */
export function lireCoordonnees(texte) {
  const nettoye = String(texte).trim().replace(/[;/]/g, ',');
  const m = nettoye.match(
    /^(-?\d{1,3}(?:[.,]\d+)?)\s*,?\s+?(-?\d{1,3}(?:[.,]\d+)?)$|^(-?\d{1,3}(?:[.,]\d+)?)\s*,\s*(-?\d{1,3}(?:[.,]\d+)?)$/,
  );
  if (!m) return null;

  const brut = [m[1] ?? m[3], m[2] ?? m[4]].map((v) => Number(String(v).replace(',', '.')));
  const [latitude, longitude] = brut;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/**
 * @param {string} requete Nom de lieu.
 * @returns {Promise<Array<{libelle:string, latitude:number, longitude:number}>>}
 */
export async function rechercherLieu(requete) {
  const nom = String(requete).trim();
  if (nom.length < 2) return [];

  const url = new URL(CONFIG.api.geocodage);
  url.searchParams.set('name', nom);
  url.searchParams.set('count', '5');
  url.searchParams.set('language', 'fr');
  url.searchParams.set('format', 'json');

  const brut = await recupererJson(url);
  const resultats = Array.isArray(brut?.results) ? brut.results : [];

  return resultats.map((r) => ({
    libelle: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    latitude: r.latitude,
    longitude: r.longitude,
  }));
}

/**
 * Résout une saisie libre en un point unique. Lève une ErreurReseau explicite
 * si rien ne correspond, de façon à pouvoir afficher le message tel quel.
 */
export async function resoudrePoint(saisie) {
  const direct = lireCoordonnees(saisie);
  if (direct) return { ...direct, libelle: null };

  const candidats = await rechercherLieu(saisie);
  if (candidats.length === 0) {
    throw new ErreurReseau(
      `Aucun lieu trouvé pour « ${saisie} ». Essayez des coordonnées, par exemple 49.4431, 1.0993.`,
      'http',
      404,
    );
  }
  return candidats[0];
}
