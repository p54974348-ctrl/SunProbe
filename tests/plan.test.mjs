/**
 * Physique du plan orienté. Aucune donnée réseau : on injecte des composantes
 * cohérentes et on vérifie que la géométrie se comporte comme la physique l'exige.
 */
import { positionSolaire } from '../src/core/solar-position.js';
import { incidence, irradianceSurPlan } from '../src/core/plan.js';
import { evaluer } from '../src/core/score.js';

const ok = (n, c, i = '') => { console.log(`${c ? 'PASS' : 'ECHEC'}  ${n} ${i}`); if (!c) process.exitCode = 1; };
const lat = 49.4431, lon = 1.0993;

/* --- Angle d'incidence : géométrie pure --- */
ok('plan horizontal, soleil au zénith -> 0°',
   Math.abs(incidence(90, 180, 0, 180).angleDeg) < 0.01);
ok('plan horizontal, soleil à 30° -> incidence 60°',
   Math.abs(incidence(30, 180, 0, 180).angleDeg - 60) < 0.01);
ok('mur sud, soleil plein sud à l\'horizon -> incidence 0°',
   Math.abs(incidence(0, 180, 90, 180).angleDeg) < 0.01);
ok('mur sud, soleil au zénith -> incidence 90°',
   Math.abs(incidence(90, 180, 90, 180).angleDeg - 90) < 0.01);
ok('mur nord, soleil plein sud -> soleil derrière (cos < 0)',
   incidence(40, 180, 90, 0).cosTheta < 0,
   `-> ${incidence(40, 180, 90, 0).angleDeg.toFixed(0)}°`);
ok('orientation ignorée quand le plan est horizontal',
   Math.abs(incidence(40, 90, 0, 0).angleDeg - incidence(40, 90, 0, 270).angleDeg) < 1e-9);

/* --- Irradiance sur plan ---
 * Les triplets doivent etre physiquement coherents : GHI = DNI·sin(h) + DHI.
 * Un jeu incoherent produit des ecarts qu'on prendrait a tort pour des bugs.
 */
const DEG = Math.PI / 180;
const coherent = (dni, dhi, hauteurDeg, instant) =>
  ({ dni, dhi, ghi: Math.round(dni * Math.sin(hauteurDeg * DEG) + dhi), hauteurDeg, instant });

const jeu = coherent(800, 130, 55, new Date('2026-07-25T12:00:00Z'));
ok('jeu de test coherent : GHI = DNI·sin(h) + DHI', jeu.ghi === 785, `-> ${jeu.ghi} W/m²`);

const horiz = irradianceSurPlan({ ...jeu, azimutSoleilDeg: 180, inclinaisonDeg: 0 });
ok('plan horizontal : POA = GHI, sans reconstruction', horiz.poa === jeu.ghi, `-> ${horiz.poa}`);

const murNord = irradianceSurPlan({ ...jeu, azimutSoleilDeg: 180,
                                    inclinaisonDeg: 90, orientationDeg: 0 });
ok('mur nord à midi : aucun direct', murNord.direct === 0);
ok('mur nord à midi : soleilDirect faux', murNord.soleilDirect === false);
ok('mur nord à midi : reçoit tout de même diffus + sol',
   murNord.poa > 50 && murNord.poa < 250, `-> ${murNord.poa.toFixed(0)} W/m²`);

const murSud = irradianceSurPlan({ ...jeu, azimutSoleilDeg: 180,
                                   inclinaisonDeg: 90, orientationDeg: 180 });
ok('mur sud reçoit plus que mur nord', murSud.poa > murNord.poa,
   `-> sud ${murSud.poa.toFixed(0)} vs nord ${murNord.poa.toFixed(0)} W/m²`);
ok('réflexion du sol présente sur un plan vertical', murSud.sol > 0,
   `-> ${murSud.sol.toFixed(0)} W/m²`);
ok('plan vertical : le sol contribue pour moitié de sa vue',
   Math.abs(murSud.sol - jeu.ghi * 0.2 * 0.5) < 0.5);
ok('albédo neige augmente l\'apport du sol',
   irradianceSurPlan({ ...jeu, azimutSoleilDeg: 180, inclinaisonDeg: 90,
                       orientationDeg: 180, albedo: 0.6 }).sol > murSud.sol * 2.5);

/* --- Le cas d'école du solaire passif : un mur sud reçoit PLUS en hiver --- */
function midiSolaire(annee, mois, jour) {
  let best = { h: -99 };
  for (let m = 0; m < 1440; m += 2) {
    const d = new Date(Date.UTC(annee, mois, jour, 0, m));
    const p = positionSolaire(d, lat, lon);
    if (p.hauteur > best.h) best = { h: p.hauteur, az: p.azimut, d };
  }
  return best;
}
const ete = midiSolaire(2026, 5, 21);
const hiver = midiSolaire(2026, 11, 21);

const murSudEte = irradianceSurPlan({ ...coherent(900, 120, ete.h, ete.d),
  azimutSoleilDeg: ete.az, inclinaisonDeg: 90, orientationDeg: 180 });
const murSudHiver = irradianceSurPlan({ ...coherent(900, 60, hiver.h, hiver.d),
  azimutSoleilDeg: hiver.az, inclinaisonDeg: 90, orientationDeg: 180 });

ok('mur sud vertical : plus de soleil en hiver qu\'en été',
   murSudHiver.poa > murSudEte.poa,
   `-> hiver ${murSudHiver.poa.toFixed(0)} vs été ${murSudEte.poa.toFixed(0)} W/m² (soleil bas = rayons de face)`);

/* --- Est le matin, ouest le soir --- */
const matin = positionSolaire(new Date(Date.UTC(2026, 5, 21, 6, 0)), lat, lon);
const soir = positionSolaire(new Date(Date.UTC(2026, 5, 21, 17, 0)), lat, lon);
const jeuMatin = coherent(700, 90, matin.hauteur, new Date(Date.UTC(2026, 5, 21, 6, 0)));
const jeuSoir = coherent(700, 90, soir.hauteur, new Date(Date.UTC(2026, 5, 21, 17, 0)));

const estMatin = irradianceSurPlan({ ...jeuMatin, azimutSoleilDeg: matin.azimut, inclinaisonDeg: 90, orientationDeg: 90 });
const ouestMatin = irradianceSurPlan({ ...jeuMatin, azimutSoleilDeg: matin.azimut, inclinaisonDeg: 90, orientationDeg: 270 });
const ouestSoir = irradianceSurPlan({ ...jeuSoir, azimutSoleilDeg: soir.azimut, inclinaisonDeg: 90, orientationDeg: 270 });

ok('façade est ensoleillée le matin, pas la façade ouest',
   estMatin.soleilDirect && !ouestMatin.soleilDirect);
ok('façade ouest ensoleillée en fin d\'après-midi', ouestSoir.soleilDirect);

/* --- Intégration dans le score --- */
const instant = new Date(Date.UTC(2026, 6, 25, 12, 0));
const geo = positionSolaire(instant, lat, lon);
const commun = { ...coherent(810, 125, geo.hauteur, instant), azimutDeg: geo.azimut };

const sH = evaluer(commun);
ok('score sans surface = comportement horizontal d\'origine',
   sH.irradianceSurface === commun.ghi && sH.surface.inclinaisonDeg === 0, `-> ${sH.score}`);

const sNord = evaluer({ ...commun, surface: { inclinaisonDeg: 90, orientationDeg: 0 } });
const sSud = evaluer({ ...commun, surface: { inclinaisonDeg: 90, orientationDeg: 180 } });
ok('façade nord : soleil_direct faux', sNord.soleilDirect === false);
ok('façade nord notée plus bas que façade sud', sNord.score < sSud.score,
   `-> nord ${sNord.score} vs sud ${sSud.score}`);
ok('angle d\'incidence remonté', sNord.angleIncidenceDeg > 90,
   `-> ${sNord.angleIncidenceDeg}°`);
ok('clarté du ciel identique quelle que soit la façade',
   sNord.indiceCielClair === sSud.indiceCielClair,
   `-> ${sSud.indiceCielClair} (elle qualifie le ciel, pas la surface)`);

/* --- Décomposition de secours quand DNI et DHI manquent --- */
const sansComposantes = evaluer({ ghi: commun.ghi, hauteurDeg: geo.hauteur, azimutDeg: geo.azimut,
  instant, surface: { inclinaisonDeg: 30, orientationDeg: 180 } });
ok('DNI/DHI absents : estimation par corrélation d\'Erbs',
   sansComposantes.composantesEstimees === true && sansComposantes.irradianceSurface > 300,
   `-> ${sansComposantes.irradianceSurface} W/m²`);
const avecMesures = evaluer({ ...commun, surface: { inclinaisonDeg: 30, orientationDeg: 180 } });
const ecart = Math.abs(sansComposantes.irradianceSurface - avecMesures.irradianceSurface);
ok('estimation à moins de 10 % de la mesure réelle',
   ecart / avecMesures.irradianceSurface < 0.10,
   `-> écart ${ecart} W/m² sur ${avecMesures.irradianceSurface} (${(100*ecart/avecMesures.irradianceSurface).toFixed(1)} %)`);

/* --- Nuit --- */
const nuit = evaluer({ ghi: 0, dni: 0, dhi: 0, hauteurDeg: -12, azimutDeg: 20, instant,
                       surface: { inclinaisonDeg: 90, orientationDeg: 180 } });
ok('nuit : score 0, aucun direct', nuit.score === 0 && nuit.etat === 'nuit' && !nuit.soleilDirect);
