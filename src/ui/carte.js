/**
 * Carte de sélection — strictement optionnelle.
 * Si Leaflet n'est pas chargé (CDN bloqué, hors ligne), la page reste
 * entièrement utilisable via la saisie texte : on masque simplement le bloc.
 */

import { CONFIG } from '../config.js';

let carte = null;
let marqueur = null;

/**
 * @param {string} idConteneur
 * @param {(p:{latitude:number, longitude:number}) => void} auClic
 * @returns {boolean} true si la carte a pu être initialisée
 */
export function initialiserCarte(idConteneur, auClic) {
  if (typeof window.L === 'undefined') {
    document.querySelector('#bloc-carte')?.classList.add('masque');
    return false;
  }

  carte = window.L.map(idConteneur, { attributionControl: true })
    .setView(CONFIG.carte.centreDefaut, CONFIG.carte.zoomDefaut);

  window.L.tileLayer(CONFIG.carte.tuiles, {
    attribution: CONFIG.carte.attribution,
    maxZoom: 18,
  }).addTo(carte);

  carte.on('click', (e) => {
    const point = { latitude: e.latlng.lat, longitude: e.latlng.lng };
    placerMarqueur(point);
    auClic(point);
  });

  return true;
}

export function placerMarqueur({ latitude, longitude }, recentrer = false) {
  if (!carte) return;
  if (marqueur) marqueur.setLatLng([latitude, longitude]);
  else marqueur = window.L.circleMarker([latitude, longitude], {
    radius: 7,
    color: '#ffb03a',
    weight: 2,
    fillColor: '#ffb03a',
    fillOpacity: 0.45,
  }).addTo(carte);

  if (recentrer) carte.setView([latitude, longitude], Math.max(carte.getZoom(), CONFIG.carte.zoomPoint));
}
