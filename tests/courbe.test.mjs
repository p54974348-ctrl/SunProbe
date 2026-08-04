import { dessinerCourbe } from '../src/ui/courbe.js';
const ok = (n,c,i='') => console.log(`${c?'PASS':'ECHEC'}  ${n} ${i}`);

const jour = Array.from({length:24}, (_,h) => {
  const local = `2026-07-25T${String(h).padStart(2,'0')}:00`;
  return { local, instant:new Date(Date.parse(local+':00Z')),
           ghi: Math.max(0, Math.round(800*Math.sin((h-6)/12*Math.PI))), dni:null, dhi:null, nuages:20 };
});

const svg = dessinerCourbe(jour, { latitude:49.44, longitude:1.10, indexSelectionne:14 });
ok('SVG produit', svg.trim().startsWith('<svg'));
ok('pas de NaN dans les coordonnees', !/NaN|Infinity/.test(svg));
ok('aire + trois courbes', (svg.match(/<path/g)||[]).length === 4, `-> ${(svg.match(/<path/g)||[]).length} chemins`);
ok('curseur present', svg.includes('<circle'));
ok('libelle accessible', /aria-label="[^"]{20,}"/.test(svg));
ok('serie vide -> pas de plantage', dessinerCourbe([], {latitude:0,longitude:0}).includes('<svg'));
ok('valeurs nulles tolerees',
   !/NaN/.test(dessinerCourbe(jour.map(p=>({...p,ghi:null})), {latitude:49,longitude:1,indexSelectionne:3})));
