import { dessinerBoussole } from '../src/ui/boussole.js';
const ok = (n,c,i='') => { console.log(`${c?'PASS':'ECHEC'}  ${n} ${i}`); if(!c) process.exitCode=1; };

const base = { azimutSoleilDeg:180, hauteurSoleilDeg:55, orientationDeg:180, inclinaisonDeg:90, soleilDirect:true };
const svg = dessinerBoussole(base);
ok('SVG produit', svg.trim().startsWith('<svg'));
ok('aucune coordonnee non numerique', !/NaN|Infinity|undefined/.test(svg));
ok('les quatre cardinaux sont places', ['>N<','>E<','>S<','>O<'].every(c => svg.includes(c)));
ok('libelle accessible present', /aria-label="[^"]{25,}"/.test(svg));
ok('face au soleil -> mention explicite', svg.includes('SOLEIL SUR LA FACE'));

const derriere = dessinerBoussole({ ...base, orientationDeg:0, soleilDirect:false });
ok('soleil derriere -> mention explicite', derriere.includes('SOLEIL DERRIÈRE LA FACE'));

const horiz = dessinerBoussole({ ...base, inclinaisonDeg:0 });
ok('surface horizontale -> cadran entier, pas de normale', horiz.includes('SURFACE HORIZONTALE') && !horiz.includes('stroke="var(--zenith)" stroke-width="2"'));

const nuit = dessinerBoussole({ ...base, hauteurSoleilDeg:-20 });
ok('nuit -> pas de marqueur solaire', nuit.includes('SOUS L') && !nuit.includes('var(--flux)'));

// Toutes les orientations doivent produire un trace valide, y compris a cheval sur le nord.
let valides = 0;
for (let az = 0; az < 360; az += 5) {
  for (const inc of [0, 15, 45, 90]) {
    const s = dessinerBoussole({ ...base, orientationDeg: az, inclinaisonDeg: inc });
    if (!/NaN|undefined/.test(s)) valides++;
  }
}
ok('288 combinaisons orientation x inclinaison sans anomalie', valides === 288, `-> ${valides}/288`);
