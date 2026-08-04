/**
 * Graphique de la journée — l'élément central de la page.
 *
 * Il superpose trois couches qui se lisent ensemble :
 *   1. aire ambre pleine  : le flux réellement prévu (GHI) ;
 *   2. trait ambre pointillé : le flux qu'un ciel parfaitement clair donnerait ;
 *   3. trait cyan : la hauteur du soleil sur l'horizon.
 *
 * L'écart entre 1 et 2 est exactement la part que les nuages retirent.
 * Le trait 3 explique la forme de la courbe : sans soleil haut, pas de flux.
 */

import { positionSolaire } from '../core/solar-position.js';
import { ghiCielClair } from '../core/clear-sky.js';
import { irradianceSurPlan, completerComposantes } from '../core/plan.js';

const L = 46, R = 42, T = 16, B = 30; // marges
const W = 720, H = 250;
const AIRE_L = W - L - R;
const AIRE_H = H - T - B;

const HAUTEUR_MIN = -12;
const HAUTEUR_MAX = 90;

const echapper = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {Array} serieJour  Pas horaires de la journée locale visée.
 * @param {object} p         { latitude, longitude, indexSelectionne }
 * @returns {string} balisage SVG
 */
export function dessinerCourbe(
  serieJour,
  { latitude, longitude, indexSelectionne = -1, surface = {} },
) {
  const inclinaisonDeg = surface.inclinaisonDeg ?? 0;
  const orientationDeg = surface.orientationDeg ?? 180;
  const albedo = surface.albedo ?? 0.2;
  if (!serieJour || serieJour.length < 2) {
    return `<svg class="courbe" viewBox="0 0 ${W} ${H}" role="img"
      aria-label="Données insuffisantes pour tracer la journée"></svg>`;
  }

  // Chaque valeur horaire couvre l'heure précédente : on la place au milieu
  // de son intervalle, où la géométrie solaire correspondante est calculée.
  const points = serieJour.map((p) => {
    const milieu = new Date(p.instant.getTime() - 1800000);
    const geo = positionSolaire(milieu, latitude, longitude);
    const heure = Number(p.local.slice(11, 13)) - 0.5;

    // Quand une surface inclinee est demandee, la courbe trace ce QU'ELLE
    // recoit, pas ce que recevrait un plan horizontal : c'est la grandeur
    // qui porte le score, et la seule qui parle du cas de l'utilisateur.
    const composantes = completerComposantes({
      ghi: p.ghi, dni: p.dni, dhi: p.dhi, hauteurDeg: geo.hauteur, instant: milieu,
    });
    const plan = irradianceSurPlan({
      ...composantes,
      hauteurDeg: geo.hauteur,
      azimutSoleilDeg: geo.azimut,
      inclinaisonDeg, orientationDeg, albedo,
      instant: milieu,
    });

    return {
      heure,
      ghi: plan.poa,
      ghiClair: ghiCielClair(geo.hauteur),
      hauteur: geo.hauteur,
      manquant: p.ghi === null,
    };
  });

  const plafond = Math.max(1000, ...points.map((p) => Math.max(p.ghi, p.ghiClair))) * 1.05;

  // Bornage : la nuit, la hauteur du soleil descend bien au-delà de l'échelle,
  // et le pas de minuit couvre l'heure précédente, donc h = -0.5.
  const borner = (v, min, max) => Math.min(max, Math.max(min, v));

  const x = (h) => L + (borner(h, 0, 24) / 24) * AIRE_L;
  const yFlux = (v) => T + AIRE_H - (borner(v, 0, plafond) / plafond) * AIRE_H;
  const yHaut = (d) =>
    T + AIRE_H -
    ((borner(d, HAUTEUR_MIN, HAUTEUR_MAX) - HAUTEUR_MIN) / (HAUTEUR_MAX - HAUTEUR_MIN)) * AIRE_H;

  const chemin = (accesseur, yFn) =>
    points.map((p, i) => `${i ? 'L' : 'M'}${x(p.heure).toFixed(1)} ${yFn(accesseur(p)).toFixed(1)}`).join(' ');

  const aireFlux =
    `M${x(points[0].heure).toFixed(1)} ${yFlux(0).toFixed(1)} ` +
    points.map((p) => `L${x(p.heure).toFixed(1)} ${yFlux(p.ghi).toFixed(1)}`).join(' ') +
    ` L${x(points.at(-1).heure).toFixed(1)} ${yFlux(0).toFixed(1)} Z`;

  // Repères horizontaux tous les 250 W/m²
  const grille = [];
  for (let v = 0; v <= plafond; v += 250) {
    grille.push(
      `<line x1="${L}" y1="${yFlux(v).toFixed(1)}" x2="${W - R}" y2="${yFlux(v).toFixed(1)}"
         stroke="var(--trait)" stroke-width="1"/>`,
      `<text x="${L - 8}" y="${(yFlux(v) + 3.5).toFixed(1)}" text-anchor="end"
         fill="var(--brume)" font-size="9" font-family="var(--data)">${v}</text>`,
    );
  }

  const heuresX = [0, 3, 6, 9, 12, 15, 18, 21, 24]
    .map(
      (h) => `<text x="${x(h).toFixed(1)}" y="${H - 10}" text-anchor="middle"
        fill="var(--brume)" font-size="9" font-family="var(--data)">${String(h).padStart(2, '0')}h</text>`,
    )
    .join('');

  // Ligne d'horizon sur l'échelle des hauteurs
  const yHorizon = yHaut(0).toFixed(1);

  let curseur = '';
  const sel = points[indexSelectionne];
  if (sel) {
    const cx = x(sel.heure).toFixed(1);
    curseur = `
      <line x1="${cx}" y1="${T}" x2="${cx}" y2="${T + AIRE_H}"
            stroke="var(--givre)" stroke-width="1" stroke-dasharray="2 3" opacity="0.65"/>
      <circle cx="${cx}" cy="${yFlux(sel.ghi).toFixed(1)}" r="5"
              fill="var(--flux)" stroke="var(--nuit)" stroke-width="2"/>
      <circle cx="${cx}" cy="${yHaut(sel.hauteur).toFixed(1)}" r="3.5"
              fill="var(--zenith)" stroke="var(--nuit)" stroke-width="2"/>`;
  }

  const resume = sel
    ? `Journée : flux maximal ${Math.round(Math.max(...points.map((p) => p.ghi)))} watts par mètre carré. ` +
      `À l'heure retenue, ${Math.round(sel.ghi)} watts par mètre carré et soleil à ${sel.hauteur.toFixed(0)} degrés.`
    : 'Courbe du flux solaire sur la journée.';

  return `
<svg class="courbe" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"
     role="img" aria-label="${echapper(resume)}">
  <g>${grille.join('')}</g>

  <line x1="${L}" y1="${yHorizon}" x2="${W - R}" y2="${yHorizon}"
        stroke="var(--zenith)" stroke-width="1" stroke-dasharray="1 5" opacity="0.5"/>

  <path d="${aireFlux}" fill="var(--flux)" opacity="0.22"/>
  <path d="${chemin((p) => p.ghi, yFlux)}" fill="none" stroke="var(--flux)" stroke-width="2"
        stroke-linejoin="round"/>
  <path d="${chemin((p) => p.ghiClair, yFlux)}" fill="none" stroke="var(--flux)"
        stroke-width="1.4" stroke-dasharray="4 3" opacity="0.55"/>
  <path d="${chemin((p) => p.hauteur, yHaut)}" fill="none" stroke="var(--zenith)"
        stroke-width="1.6" opacity="0.9"/>

  ${curseur}
  ${heuresX}

  <text x="${L}" y="${T - 4}" fill="var(--brume)" font-size="9"
        font-family="var(--data)" letter-spacing="1">W/m²</text>
  <text x="${W - R}" y="${T - 4}" text-anchor="end" fill="var(--zenith)" font-size="9"
        font-family="var(--data)" letter-spacing="1">HAUTEUR 0-90°</text>
</svg>`;
}
