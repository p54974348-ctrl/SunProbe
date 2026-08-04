/**
 * Le prototype duplique volontairement la logique du noyau (aucune etape de
 * compilation, un seul fichier). Ce test verifie qu'il ne DIVERGE pas :
 * il extrait son script, l'execute avec un DOM factice, et compare ses
 * resultats numeriques a ceux des modules de src/core.
 */
import { readFileSync } from 'node:fs';
import { positionSolaire } from '../src/core/solar-position.js';
import { irradianceSurPlan, completerComposantes, incidence } from '../src/core/plan.js';
import { ghiCielClair } from '../src/core/clear-sky.js';

const ok = (n, c, i = '') => { console.log(`${c ? 'PASS' : 'ECHEC'}  ${n} ${i}`); if (!c) process.exitCode = 1; };

const html = readFileSync(new URL('../prototype/sunprobe-prototype.html', import.meta.url), 'utf8');
const script = html.split('<script>')[1].split('</script>')[0];

ok('prototype : syntaxe JavaScript valide', (() => {
  try { new Function(script); return true; } catch (e) { console.log('   ', e.message); return false; }
})());

ok('prototype : champs de surface presents dans le formulaire',
   html.includes('id="inclinaison"') && html.includes('id="orientation"'));

// DOM factice : suffisant pour que le script s'installe sans lever d'erreur.
const elements = new Map();
const faux = () => ({ value: '', textContent: '', innerHTML: '', hidden: true,
                      style: {}, disabled: false, addEventListener() {} });
const document = {
  getElementById: (id) => { if (!elements.has(id)) elements.set(id, faux()); return elements.get(id); },
};

const executer = new Function('document', `${script}\n; return { positionSolaire, ghiCielClair, irradianceSurPlan, completerComposantes, evaluer };`);
const proto = executer(document);
ok('prototype : script executable avec un DOM factice', typeof proto.positionSolaire === 'function');

/* --- Concordance numerique avec les modules --- */
const lat = 49.4431, lon = 1.0993;
let ecartHauteur = 0, ecartAzimut = 0, ecartPoa = 0, ecartClair = 0, cas = 0;

for (const mois of [0, 3, 5, 8, 11]) {
  for (const heure of [6, 9, 12, 15, 18]) {
    const instant = new Date(Date.UTC(2026, mois, 15, heure, 0));
    const a = positionSolaire(instant, lat, lon);
    const b = proto.positionSolaire(instant, lat, lon);
    ecartHauteur = Math.max(ecartHauteur, Math.abs(a.hauteur - b.hauteur));
    ecartAzimut = Math.max(ecartAzimut, Math.abs(a.azimut - b.azimut));
    ecartClair = Math.max(ecartClair, Math.abs(ghiCielClair(a.hauteur) - proto.ghiCielClair(a.hauteur)));

    for (const [inc, ori] of [[0, 180], [30, 180], [90, 180], [90, 0], [90, 90], [45, 270]]) {
      const entree = { ghi: 600, dni: 750, dhi: 110, hauteurDeg: a.hauteur,
                       azimutSoleilDeg: a.azimut, inclinaisonDeg: inc, orientationDeg: ori, instant };
      const p1 = irradianceSurPlan(entree);
      const p2 = proto.irradianceSurPlan(entree);
      ecartPoa = Math.max(ecartPoa, Math.abs(p1.poa - p2.poa));
      cas++;
    }
  }
}

ok('position solaire identique', ecartHauteur < 1e-9 && ecartAzimut < 1e-9,
   `-> ecart max ${ecartHauteur.toExponential(1)}° / ${ecartAzimut.toExponential(1)}°`);
ok('modele de ciel clair identique', ecartClair < 1e-9, `-> ecart max ${ecartClair.toExponential(1)} W/m²`);
ok('irradiance sur plan identique', ecartPoa < 1e-9,
   `-> ecart max ${ecartPoa.toExponential(1)} W/m² sur ${cas} configurations`);

// Decomposition d'Erbs
let ecartErbs = 0;
for (const ghi of [80, 250, 500, 780]) {
  const instant = new Date(Date.UTC(2026, 6, 25, 12, 0));
  const h = positionSolaire(instant, lat, lon).hauteur;
  const a = completerComposantes({ ghi, dni: undefined, dhi: undefined, hauteurDeg: h, instant });
  const b = proto.completerComposantes({ ghi, dni: undefined, dhi: undefined, hauteurDeg: h, instant });
  ecartErbs = Math.max(ecartErbs, Math.abs(a.dni - b.dni), Math.abs(a.dhi - b.dhi));
}
ok('decomposition d\'Erbs identique', ecartErbs < 1e-9, `-> ecart max ${ecartErbs.toExponential(1)} W/m²`);

ok('angle d\'incidence coherent entre les deux',
   Math.abs(incidence(40, 200, 90, 180).angleDeg
     - proto.irradianceSurPlan({ ghi: 1, dni: 1, dhi: 1, hauteurDeg: 40, azimutSoleilDeg: 200,
         inclinaisonDeg: 90, orientationDeg: 180, instant: new Date() }).angle) < 1e-9);
