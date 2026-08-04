import { positionSolaire, cardinal } from '../src/core/solar-position.js';
import { ghiCielClair } from '../src/core/clear-sky.js';
import { evaluer, ETATS } from '../src/core/score.js';

const ok = (nom, cond, info='') => console.log(`${cond?'PASS':'ECHEC'}  ${nom} ${info}`);

// Rouen, solstice d'été : hauteur maximale attendue ~= 90 - 49.44 + 23.44 = 64.0 deg
const lat = 49.4431, lon = 1.0993;
let max = -99, hMax = null;
for (let m = 0; m < 1440; m += 2) {
  const d = new Date(Date.UTC(2026, 5, 21, 0, m));
  const p = positionSolaire(d, lat, lon);
  if (p.hauteur > max) { max = p.hauteur; hMax = d; }
}
ok('hauteur max solstice ~64.0', Math.abs(max - 64.0) < 0.4, `-> ${max.toFixed(2)}°`);
// Midi solaire = 12:00 UTC - longitude/15 - equation du temps.
// Rouen (1.0993 E) le 21 juin : 12:00 - 4.4 min + 1.8 min ~= 11:57 UTC.
ok('midi solaire ~11:57 UTC', Math.abs(hMax.getUTCHours()*60+hMax.getUTCMinutes() - 717) < 4,
   `-> ${hMax.toISOString().slice(11,16)} UTC`);

// Solstice d'hiver : 90 - 49.44 - 23.44 = 17.1
let maxH = -99;
for (let m = 0; m < 1440; m += 2) {
  const p = positionSolaire(new Date(Date.UTC(2026, 11, 21, 0, m)), lat, lon);
  if (p.hauteur > maxH) maxH = p.hauteur;
}
ok('hauteur max solstice hiver ~17.1', Math.abs(maxH - 17.1) < 0.5, `-> ${maxH.toFixed(2)}°`);

// Azimut au midi solaire, hémisphère nord : plein sud (~180)
const midi = positionSolaire(hMax, lat, lon);
ok('azimut midi ~180 (S)', Math.abs(midi.azimut - 180) < 1.5, `-> ${midi.azimut.toFixed(1)}° ${cardinal(midi.azimut)}`);

// Matin -> est, soir -> ouest
const matin = positionSolaire(new Date(Date.UTC(2026,5,21,6,0)), lat, lon);
const soir  = positionSolaire(new Date(Date.UTC(2026,5,21,18,0)), lat, lon);
ok('matin à l\'est', matin.azimut > 45 && matin.azimut < 135, `-> ${matin.azimut.toFixed(0)}° ${cardinal(matin.azimut)}`);
ok('soir à l\'ouest', soir.azimut > 225 && soir.azimut < 315, `-> ${soir.azimut.toFixed(0)}° ${cardinal(soir.azimut)}`);

// Hémisphère sud : Sydney, azimut au midi ~ nord
let maxS = -99, hS = null;
for (let m = 0; m < 1440; m += 2) {
  const d = new Date(Date.UTC(2026, 11, 21, 0, m));
  const p = positionSolaire(d, -33.87, 151.21);
  if (p.hauteur > maxS) { maxS = p.hauteur; hS = p; }
}
ok('Sydney midi plein nord', hS.azimut < 3 || hS.azimut > 357, `-> ${hS.azimut.toFixed(1)}°`);

// Nuit polaire / soleil de minuit : Tromsø 21 juin, jamais sous l'horizon
let minT = 99;
for (let m = 0; m < 1440; m += 10) {
  minT = Math.min(minT, positionSolaire(new Date(Date.UTC(2026,5,21,0,m)), 69.65, 18.96).hauteur);
}
ok('soleil de minuit à Tromsø', minT > 0, `-> min ${minT.toFixed(2)}°`);

// Ciel clair
ok('ciel clair au zénith ~1030 W/m²', Math.abs(ghiCielClair(90) - 1035) < 15, `-> ${ghiCielClair(90).toFixed(0)}`);
ok('ciel clair nuit = 0', ghiCielClair(-5) === 0);
ok('ciel clair croissant', ghiCielClair(60) > ghiCielClair(30));

// Score
ok('score nuit = 0', evaluer({ghi:0, hauteurDeg:-10}).etat === ETATS.NUIT);
ok('plein soleil', evaluer({ghi:800, hauteurDeg:55}).etat === ETATS.PLEIN_SOLEIL,
   `-> ${evaluer({ghi:800, hauteurDeg:55}).score}`);
ok('soleil faible', evaluer({ghi:300, hauteurDeg:30}).etat === ETATS.SOLEIL_FAIBLE,
   `-> ${evaluer({ghi:300, hauteurDeg:30}).score}`);
ok('ombre', evaluer({ghi:60, hauteurDeg:20}).etat === ETATS.OMBRE,
   `-> ${evaluer({ghi:60, hauteurDeg:20}).score}`);
ok('score plafonné à 100', evaluer({ghi:5000, hauteurDeg:80}).score === 100);
ok('ghi absent -> pas de plantage', evaluer({ghi:null, hauteurDeg:40}).score === 0);
const e = evaluer({ghi:700, hauteurDeg:55});
ok('indice ciel clair plausible', e.indiceCielClair > 0.7 && e.indiceCielClair < 1.0, `-> ${e.indiceCielClair}`);

// --- Selection du pas horaire (convention Open-Meteo : moyenne sur l'heure precedente)
import { selectionnerPas } from '../src/data/irradiance.js';
const serie = ['2026-07-25T12:00','2026-07-25T13:00','2026-07-25T14:00','2026-07-25T15:00']
  .map((local,i) => ({ local, instant:new Date(Date.parse(local+':00Z')), ghi:[400,500,600,700][i],
                       dni:null, dhi:null, nuages:null }));
ok('13:30 tombe dans le pas 14:00', selectionnerPas(serie,'2026-07-25T13:30').pas.local === '2026-07-25T14:00');
ok('14:00 tombe dans le pas 14:00', selectionnerPas(serie,'2026-07-25T14:00').pas.local === '2026-07-25T14:00');
ok('hors serie -> fraicheur approchee', selectionnerPas(serie,'2026-07-25T23:00').fraicheur === 'approchee');
const troue = serie.map((p,i) => i===2 ? {...p, ghi:null} : p);
ok('trou de donnee -> pas voisin', selectionnerPas(troue,'2026-07-25T13:30').pas.ghi !== null);

// --- Lecture de coordonnees saisies
import { lireCoordonnees } from '../src/data/geocodage.js';
ok('coordonnees "49.4431, 1.0993"', lireCoordonnees('49.4431, 1.0993')?.latitude === 49.4431);
ok('coordonnees a virgule decimale', lireCoordonnees('49,4431 / 1,0993')?.longitude === 1.0993);
ok('latitude hors bornes rejetee', lireCoordonnees('120, 5') === null);
ok('texte libre rejete', lireCoordonnees('Rouen') === null);
