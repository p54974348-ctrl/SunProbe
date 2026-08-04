/**
 * Orchestration de la page. Ce fichier ne calcule rien et ne dessine rien
 * lui-même : il lit le formulaire, appelle le pipeline partagé, traite les
 * erreurs et confie l'affichage à src/ui.
 */

import { CONFIG } from './config.js';
import { cardinal } from './core/solar-position.js';
import { resoudrePoint } from './data/geocodage.js';
import { ErreurReseau } from './data/http.js';
import { sonder } from './sonde.js';
import { initialiserCarte, placerMarqueur } from './ui/carte.js';
import {
  afficherResultat, afficherErreur, afficherChargement,
  afficherAccueil, afficherJsonBrut, rafraichirAideSurface, copier,
} from './ui/rendu.js';

const $ = (sel) => document.querySelector(sel);

let derniereSortie = null;

/* -------------------------------------------------------------- formulaire */

const borner = (v, min, max) => Math.min(max, Math.max(min, v));
const mod360 = (v) => ((v % 360) + 360) % 360;

/**
 * Les deux champs sont vides par défaut — et `Number('')` vaut 0 (piège n° 2),
 * d'où les tests explicites sur la chaîne vide.
 *
 *   rien de saisi          -> mesure du lieu, à plat : aucune surface visée ;
 *   orientation seule      -> un mur : surface verticale (90°) vers cette orientation ;
 *   inclinaison renseignée -> elle prime (toit incliné, panneau…).
 */
function lireSurface() {
  const orientationBrut = $('#orientation').value.trim();
  const inclinaisonBrut = $('#inclinaison').value.trim();
  const aucune = orientationBrut === '' && inclinaisonBrut === '';

  const orientation = Number(orientationBrut);
  const inclinaison = Number(inclinaisonBrut);

  const inclinaisonDeg =
    inclinaisonBrut !== '' && Number.isFinite(inclinaison)
      ? borner(inclinaison, 0, 90)
      : orientationBrut !== '' ? 90 : CONFIG.surface.inclinaisonDeg;

  return {
    inclinaisonDeg: aucune ? CONFIG.surface.inclinaisonDeg : inclinaisonDeg,
    orientationDeg:
      orientationBrut !== '' && Number.isFinite(orientation)
        ? mod360(orientation)
        : CONFIG.surface.orientationDeg,
    albedo: CONFIG.surface.albedo,
    aucune,
  };
}

function lireFormulaire() {
  return {
    saisie: $('#lieu-saisi').value.trim(),
    date: $('#date').value,
    heure: $('#heure').value,
    surface: lireSurface(),
  };
}

/** Mode de réponse : « html » (la page) par défaut, « json » (sortie brute). */
function lireFormat() {
  return $('#format').value === 'json' ? 'json' : 'html';
}

function construirePermalien(sortie) {
  const u = new URL(window.location.href);
  u.search = '';
  const p = new URLSearchParams({
    lat: sortie.point.latitude,
    lon: sortie.point.longitude,
    date: sortie.horodatage_local.slice(0, 10),
    heure: sortie.horodatage_local.slice(11, 16),
  });
  if (sortie.point.libelle) p.set('lieu', sortie.point.libelle);
  if (sortie.surface.inclinaison_deg > 0) {
    p.set('inclinaison', sortie.surface.inclinaison_deg);
    p.set('orientation', sortie.surface.orientation_deg);
  }
  if (lireFormat() === 'json') p.set('format', 'json');
  u.search = p.toString();
  return u.toString();
}

/* ---------------------------------------------------------------- pipeline */

async function lancer(demande) {
  const d = demande ?? lireFormulaire();

  if (!d.point && !d.saisie) {
    afficherErreur('Indiquez une adresse, des coordonnées, ou cliquez sur la carte.');
    return;
  }
  if (!d.date || !d.heure) {
    afficherErreur('Renseignez une date et une heure.');
    return;
  }

  afficherChargement(true);
  try {
    const lieu = d.point ?? (await resoudrePoint(d.saisie));

    const resultat = await sonder({
      latitude: lieu.latitude,
      longitude: lieu.longitude,
      at: `${d.date}T${d.heure}`,
      surface: d.surface,
      libelle: lieu.libelle ?? null,
    });

    derniereSortie = resultat.sortie;

    // Mode JSON : la sortie brute remplace la page, rien d'autre à dessiner.
    if (lireFormat() === 'json') {
      history.replaceState(null, '', construirePermalien(resultat.sortie));
      afficherJsonBrut(resultat.sortie);
      return;
    }

    placerMarqueur(
      { latitude: resultat.sortie.point.latitude, longitude: resultat.sortie.point.longitude },
      true,
    );
    afficherResultat({ ...resultat, permalien: construirePermalien(resultat.sortie) });
  } catch (err) {
    const message = err instanceof ErreurReseau
      ? err.message
      : 'Erreur inattendue pendant la mesure. Réessayez dans un instant.';
    if (lireFormat() === 'json') afficherJsonBrut({ erreur: message });
    else afficherErreur(message);
    if (!(err instanceof ErreurReseau)) console.error(err);
  } finally {
    afficherChargement(false);
  }
}

/* --------------------------------------------------------------- démarrage */

function maintenantLocal() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return { date: d.toISOString().slice(0, 10), heure: d.toISOString().slice(11, 16) };
}

function synchroniserAideSurface() {
  const s = lireSurface();
  rafraichirAideSurface(s.aucune, s.inclinaisonDeg, s.orientationDeg, cardinal(s.orientationDeg));
}

function initialiser() {
  const now = maintenantLocal();
  const params = new URLSearchParams(window.location.search);

  $('#date').value = params.get('date') || now.date;
  $('#heure').value = params.get('heure') || now.heure;
  if (params.has('inclinaison')) $('#inclinaison').value = params.get('inclinaison');
  if (params.has('orientation')) $('#orientation').value = params.get('orientation');
  if (params.get('format') === 'json') $('#format').value = 'json';
  synchroniserAideSurface();

  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  const aDesCoordonnees = params.has('lat') && Number.isFinite(lat) && Number.isFinite(lon);

  $('#lieu-saisi').value = aDesCoordonnees
    ? params.get('lieu') || `${lat}, ${lon}`
    : params.get('lieu') || '';

  initialiserCarte('carte', (point) => {
    $('#lieu-saisi').value = `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
    lancer({ ...lireFormulaire(), point });
  });

  $('#formulaire').addEventListener('submit', (e) => {
    e.preventDefault();
    lancer();
  });

  for (const id of ['#inclinaison', '#orientation']) {
    $(id).addEventListener('input', synchroniserAideSurface);
  }

  $('#copier-json').addEventListener('click', (e) => {
    if (derniereSortie) copier(e.currentTarget, JSON.stringify(derniereSortie, null, 2));
  });

  $('#permalien').addEventListener('click', (e) => {
    const url = e.currentTarget.dataset.url;
    if (url) copier(e.currentTarget, url);
  });

  if (aDesCoordonnees) {
    lancer({
      ...lireFormulaire(),
      point: { latitude: lat, longitude: lon, libelle: params.get('lieu') },
    });
  } else {
    afficherAccueil();
  }
}

document.addEventListener('DOMContentLoaded', initialiser);
