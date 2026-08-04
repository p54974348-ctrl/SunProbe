/**
 * SunProbe — API sur Cloudflare Pages Functions.
 *
 * Route servie : /api/v1/ensoleillement
 *
 * Paramètres :
 *   lat, lon       requis, degrés décimaux
 *   at             facultatif, AAAA-MM-JJTHH:MM en heure locale du point
 *   inclinaison    facultatif, 0-90.  0 = horizontal, 90 = mur ou fenêtre
 *   orientation    facultatif, 0-360 depuis le nord.  180 = plein sud
 *   albedo         facultatif, 0-1.   défaut 0.2
 *
 * Même pipeline que server/sunprobe-api.mjs et que la page : le noyau ne
 * dépend d'aucun module Node, donc il tourne tel quel dans l'isolat Workers.
 *
 * Contraintes du plan gratuit prises en compte :
 *   - 10 ms de temps processeur par requête → le calcul reste trivial ;
 *   - 100 000 requêtes/jour → le cache de périphérie absorbe les sondages
 *     répétés d'un automatisme domotique.
 */

import { lireParametres } from '../../../src/core/requete.js';
import { sonder } from '../../../src/sonde.js';
import { ErreurReseau } from '../../../src/data/http.js';
import { sortieAvecPontIFTTT } from '../../../src/data/webhook-ifttt.js';

const CACHE_SECONDES = 300;

const json = (corps, statut = 200, cacheSecondes = 0) =>
  new Response(JSON.stringify(corps, null, 2), {
    status: statut,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': cacheSecondes ? `public, max-age=${cacheSecondes}` : 'no-store',
    },
  });

/**
 * Restriction facultative aux points autorisés.
 * Définir la variable d'environnement POINTS_AUTORISES dans Cloudflare, par ex. :
 *   49.44,1.10 ; 48.85,2.35
 * Sans elle, l'endpoint accepte n'importe quelles coordonnées.
 */
function pointAutorise(lat, lon, liste) {
  if (!liste) return true;
  return String(liste)
    .split(';')
    .map((p) => p.trim().split(',').map(Number))
    .some(([la, lo]) => Math.abs(la - lat) < 0.05 && Math.abs(lo - lon) < 0.05);
}

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);

  const lecture = lireParametres(url.searchParams);
  if (!lecture.ok) return json(lecture.erreur, lecture.statut);

  const { latitude, longitude } = lecture.valeurs;
  if (!pointAutorise(latitude, longitude, env.POINTS_AUTORISES)) {
    return json({ erreur: 'Ce point n\u2019est pas autorisé sur cette instance.' }, 403);
  }

  // Cache de périphérie : un automatisme qui sonde toutes les minutes
  // ne déclenche qu'un appel réseau réel toutes les cinq minutes.
  const cache = caches.default;
  const cle = new Request(url.toString(), request);
  const enCache = await cache.match(cle);
  if (enCache) return enCache;

  try {
    const { sortie } = await sonder(lecture.valeurs);
    // Pont IFTTT : ici, le cache de périphérie espace aussi les déclenchements —
    // une réponse servie du cache ne repasse pas par la fonction.
    const corps = await sortieAvecPontIFTTT(sortie, lecture.valeurs.ifttt);
    const reponse = json(corps, 200, CACHE_SECONDES);
    waitUntil(cache.put(cle, reponse.clone()));
    return reponse;
  } catch (err) {
    if (err instanceof ErreurReseau) {
      const statut = err.cause === 'timeout' ? 504 : err.statut && err.statut < 500 ? 400 : 502;
      return json({ erreur: err.message, cause: err.cause }, statut);
    }
    return json({ erreur: 'Erreur interne.' }, 500);
  }
}
