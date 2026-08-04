#!/usr/bin/env node
/**
 * SunProbe — service JSON pour la domotique.
 *
 * Une page web ne peut pas être interrogée par un scénario domotique : un
 * automatisme ne sait pas lire du HTML. C'est ce service qu'il interroge,
 * en passant la position et l'orientation de la surface, et qui répond
 * par un pourcentage d'ensoleillement.
 *
 * Il importe le même pipeline que la page, sans le dupliquer : une seule
 * définition de « plein soleil » existe dans le projet.
 *
 * Node >= 18 (fetch et AbortController natifs). Aucune dépendance.
 *
 *   node server/sunprobe-api.mjs
 *   curl 'http://localhost:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993'
 *   curl 'http://localhost:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993&inclinaison=90&orientation=180'
 */

import { createServer } from 'node:http';
import { lireParametres } from '../src/core/requete.js';
import { sonder } from '../src/sonde.js';
import { ErreurReseau } from '../src/data/http.js';

const PORT = Number(process.env.PORT) || 8787;
const HOTE = process.env.HOST || '0.0.0.0';
const CACHE_MS = Number(process.env.CACHE_MS) || 5 * 60 * 1000;

/* Cache mémoire : une sonde domotique interroge souvent, la météo change lentement. */
const cache = new Map();

async function sonderAvecCache(valeurs) {
  const s = valeurs.surface;
  const cle = [
    valeurs.latitude.toFixed(3), valeurs.longitude.toFixed(3),
    valeurs.at ?? 'maintenant',
    s.inclinaisonDeg, s.orientationDeg, s.albedo,
  ].join('|');

  const entree = cache.get(cle);
  if (entree && Date.now() - entree.ts < CACHE_MS) return entree.valeur;

  const { sortie } = await sonder(valeurs);
  cache.set(cle, { ts: Date.now(), valeur: sortie });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return sortie;
}

/* ------------------------------------------------------------------ HTTP */

const repondre = (res, code, corps) => {
  const texte = JSON.stringify(corps, null, 2);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(texte),
  });
  res.end(texte);
};

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') return repondre(res, 200, { statut: 'ok' });

  if (url.pathname !== '/api/v1/ensoleillement') {
    return repondre(res, 404, {
      erreur: 'Route inconnue.',
      routes: ['/api/v1/ensoleillement', '/health'],
      parametres: {
        lat: 'requis, degrés décimaux',
        lon: 'requis, degrés décimaux',
        at: 'facultatif, AAAA-MM-JJTHH:MM en heure locale du point',
        inclinaison: 'facultatif, 0-90. 0 = horizontal, 90 = mur',
        orientation: 'facultatif, 0-360 depuis le nord. 180 = sud',
        albedo: 'facultatif, 0-1. Défaut 0.2',
      },
    });
  }

  const lecture = lireParametres(url.searchParams);
  if (!lecture.ok) return repondre(res, lecture.statut, lecture.erreur);

  try {
    repondre(res, 200, await sonderAvecCache(lecture.valeurs));
  } catch (err) {
    if (err instanceof ErreurReseau) {
      const code = err.cause === 'timeout' ? 504 : err.statut && err.statut < 500 ? 400 : 502;
      return repondre(res, code, { erreur: err.message, cause: err.cause });
    }
    console.error(err);
    repondre(res, 500, { erreur: 'Erreur interne.' });
  }
});

serveur.listen(PORT, HOTE, () => {
  console.log(`SunProbe API — http://${HOTE}:${PORT}/api/v1/ensoleillement?lat=49.4431&lon=1.0993`);
});
