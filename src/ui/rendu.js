/**
 * Rendu — la seule couche qui touche au DOM.
 * Elle ne calcule rien et n'appelle aucun réseau : elle reçoit un résultat
 * déjà constitué et l'affiche.
 */

import { dessinerCourbe } from './courbe.js';
import { dessinerBoussole } from './boussole.js';

const $ = (sel) => document.querySelector(sel);

const nb = (v, unite = '', decimales = 0) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(decimales)}${unite}`;

export function afficherChargement(actif) {
  const bouton = $('#mesurer');
  if (!bouton) return; // mode JSON : la page ne contient plus le formulaire
  bouton.disabled = actif;
  bouton.innerHTML = actif ? '<span class="chargement"></span>Mesure en cours' : 'Mesurer';
}

export function afficherErreur(message) {
  $('#resultat').classList.add('masque');
  const zone = $('#message');
  zone.classList.remove('masque');
  zone.dataset.ton = 'erreur';
  zone.textContent = message;
}

export function afficherAccueil() {
  $('#resultat').classList.add('masque');
  const zone = $('#message');
  zone.classList.remove('masque');
  zone.dataset.ton = 'vide';
  zone.textContent =
    'Saisissez une adresse ou des coordonnées, décrivez la surface, puis lancez la mesure.';
}

/** Rappel de la surface en clair, sous les champs du formulaire. */
export function rafraichirAideSurface(aucune, inclinaisonDeg, orientationDeg, cardinal) {
  $('#aide-surface').textContent = aucune
    ? 'Laissez vide pour mesurer le lieu, \u00e0 plat. Une orientation (depuis le nord : ' +
      '90 = E, 180 = S, 270 = O) d\u00e9crit un mur vertical.'
    : inclinaisonDeg === 0
      ? 'Surface horizontale : le sol, un toit plat. L\u2019orientation n\u2019a alors aucun effet.'
      : `Mur inclin\u00e9 à ${inclinaisonDeg}°, tourné vers ${orientationDeg}° (${cardinal}).`;
}

/**
 * @param {object} r
 * @param {object} r.sortie      Objet domotique (core/sortie-domotique.js).
 * @param {Array}  r.serieJour   Pas horaires du jour, pour le graphique.
 * @param {number} r.indexJour   Index du pas retenu dans serieJour.
 * @param {string} r.permalien
 */
export function afficherResultat({ sortie, serieJour, indexJour, permalien }) {
  $('#message').classList.add('masque');
  $('#resultat').classList.remove('masque');

  $('#score').firstChild.textContent = String(sortie.score);
  const etat = $('#etat');
  etat.textContent = sortie.etat;
  etat.dataset.etat = sortie.etat;

  const p = sortie.point;
  const s = sortie.surface;
  const incline = s.inclinaison_deg > 0;

  $('#lieu').textContent =
    `${p.libelle ? p.libelle + ' · ' : ''}${p.latitude}, ${p.longitude}` +
    `${p.altitude_m !== null ? ` · ${p.altitude_m} m` : ''}` +
    `${sortie.horodatage_local ? ` · ${sortie.horodatage_local.replace('T', ' ')}` : ''}` +
    `${sortie.fuseau ? ` (${sortie.fuseau})` : ''}` +
    (incline
      ? ` · surface ${s.inclinaison_deg}° vers ${s.orientation_cardinal}`
      : ' · surface horizontale') +
    (sortie.fraicheur !== 'ok' ? ' · donnée de l\u2019heure voisine' : '') +
    (sortie.mesures.composantes_estimees ? ' · composantes estimées' : '');

  const g = sortie.geometrie;
  const m = sortie.mesures;

  $('#boussole').innerHTML = dessinerBoussole({
    azimutSoleilDeg: g.azimut_deg ?? 0,
    hauteurSoleilDeg: g.hauteur_deg ?? -90,
    orientationDeg: s.orientation_deg,
    inclinaisonDeg: s.inclinaison_deg,
    soleilDirect: sortie.soleil_direct,
  });

  // Part du jour où la face reçoit le soleil direct, ex. « 62 % · 9 h/15 h ».
  const e = sortie.ensoleillement_jour;
  const soleilDuJour =
    !e || e.pourcentage === null ? '—' : `${e.pourcentage} % · ${e.duree_soleil_h} h/${e.duree_jour_h} h`;

  const lignes = incline
    ? [
        ['Sur la surface', nb(m.irradiance_surface_w_m2, ' W/m²'), 'flux'],
        ['dont direct', nb(m.surface_direct_w_m2, ' W/m²'), 'flux'],
        ['dont diffus', nb(m.surface_diffus_w_m2, ' W/m²'), 'flux'],
        ['dont sol', nb(m.surface_sol_w_m2, ' W/m²'), 'flux'],
        ['Soleil du jour', soleilDuJour, 'flux'],
        ['Incidence', nb(g.angle_incidence_deg, '°', 0), 'geo'],
        ['Hauteur', nb(g.hauteur_deg, '°', 1), 'geo'],
        ['Azimut', `${nb(g.azimut_deg, '°', 0)} ${g.azimut_cardinal}`, 'geo'],
        ['Horizontal', nb(m.ghi_w_m2, ' W/m²'), 'geo'],
      ]
    : [
        ['GHI global', nb(m.ghi_w_m2, ' W/m²'), 'flux'],
        ['DNI direct', nb(m.dni_w_m2, ' W/m²'), 'flux'],
        ['DHI diffus', nb(m.dhi_w_m2, ' W/m²'), 'flux'],
        ['Nuages', nb(m.couverture_nuageuse_pct, ' %'), 'flux'],
        ['Soleil du jour', soleilDuJour, 'flux'],
        ['Hauteur', nb(g.hauteur_deg, '°', 1), 'geo'],
        ['Azimut', `${nb(g.azimut_deg, '°', 0)} ${g.azimut_cardinal}`, 'geo'],
        ['Ciel clair', nb(g.ghi_ciel_clair_w_m2, ' W/m²'), 'geo'],
        ['Clarté', g.indice_ciel_clair === null ? '—' : g.indice_ciel_clair.toFixed(2), 'geo'],
      ];

  $('#mesures').innerHTML = lignes
    .map(
      ([cle, val, couche]) =>
        `<div class="mesure" data-couche="${couche}"><dt>${cle}</dt><dd>${val}</dd></div>`,
    )
    .join('');

  $('#titre-courbe').textContent = incline
    ? 'Journée complète — sur la surface'
    : 'Journée complète';
  $('#legende-flux').textContent = incline ? 'Reçu par la surface' : 'Flux prévu';

  $('#graphique').innerHTML = dessinerCourbe(serieJour, {
    latitude: p.latitude,
    longitude: p.longitude,
    indexSelectionne: indexJour,
    surface: {
      inclinaisonDeg: s.inclinaison_deg,
      orientationDeg: s.orientation_deg,
      albedo: s.albedo,
    },
  });

  $('#sortie').textContent = JSON.stringify(sortie, null, 2);
  $('#permalien').dataset.url = permalien;
}

/**
 * Mode JSON : la page entière s'efface au profit de la sortie brute,
 * imprimée telle quelle. L'URL courante tient alors lieu de permalien.
 * Sert aussi aux erreurs : passer { erreur: "…" }.
 */
export function afficherJsonBrut(objet) {
  document.title = 'SunProbe — JSON';
  const pre = document.createElement('pre');
  pre.className = 'json-brut';
  pre.textContent = JSON.stringify(objet, null, 2);
  document.body.replaceChildren(pre);
}

/** Copie un texte et confirme brièvement dans le bouton. */
export async function copier(bouton, texte) {
  const initial = bouton.textContent;
  try {
    await navigator.clipboard.writeText(texte);
    bouton.textContent = 'Copié';
  } catch {
    bouton.textContent = 'Copie refusée';
  }
  setTimeout(() => { bouton.textContent = initial; }, 1600);
}
