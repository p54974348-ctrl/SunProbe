// Simule l'environnement Cloudflare Workers pour tester la fonction hors ligne.
const ok = (n,c,i='') => { console.log(`${c?'PASS':'ECHEC'}  ${n} ${i}`); if(!c) process.exitCode=1; };

const store = new Map();
globalThis.caches = { default: {
  match: async (req) => store.get(req.url) ?? undefined,
  put: async (req, res) => { store.set(req.url, res); },
}};

const jour = new Date().toISOString().slice(0,10);
const heures = Array.from({length:24},(_,h)=>`${jour}T${String(h).padStart(2,'0')}:00`);
let appelsReseau = 0;
let urlIFTTTRecue = null;
globalThis.fetch = async (url) => {
  if (String(url).includes('maker.ifttt.com')) { urlIFTTTRecue = String(url); return { ok:true, status:200 }; }
  appelsReseau++; return { ok:true, status:200, json: async () => ({
  latitude:49.44, longitude:1.1, elevation:32, utc_offset_seconds:7200, timezone:'Europe/Paris',
  hourly:{ time:heures,
    shortwave_radiation: heures.map((_,h)=>Math.max(0,Math.round(820*Math.sin((h-6)/12*Math.PI)))),
    direct_normal_irradiance: heures.map(()=>700),
    diffuse_radiation: heures.map(()=>120),
    cloud_cover: heures.map(()=>18) }})};
};

const { onRequestGet } = await import('../functions/api/v1/ensoleillement.js');
const appeler = (qs, env={}) => onRequestGet({
  request: new Request(`https://sunprobe.pages.dev/api/v1/ensoleillement${qs}`),
  env, waitUntil: (p) => p,
});

let r = await appeler('?lat=49.4431&lon=1.0993&at=' + jour + 'T14:00');
let corps = await r.json();
ok('réponse 200', r.status === 200);
ok('état valide', ['plein soleil','soleil faible','ombre','nuit'].includes(corps.etat), `-> ${corps.etat} / ${corps.score}`);
ok('CORS ouvert', r.headers.get('access-control-allow-origin') === '*');
ok('cache 5 min annoncé', r.headers.get('cache-control') === 'public, max-age=300');
// Temps processeur : mesure a chaud, hors chargement des modules et hors cache.
// Cloudflare ne compte pas l'attente reseau dans les 10 ms allouees.
const durees = [];
for (let i = 0; i < 30; i++) {
  const t0 = process.hrtime.bigint();
  await appeler(`?lat=49.${4000+i}&lon=1.0993&at=${jour}T14:00`);
  durees.push(Number(process.hrtime.bigint() - t0) / 1e6);
}
durees.sort((a,b)=>a-b);
const median = durees[15];
ok('temps processeur tres en dessous des 10 ms', median < 3,
   `-> mediane ${median.toFixed(2)} ms sur 30 appels a froid de cache`);

const avant = appelsReseau;
await appeler('?lat=49.4431&lon=1.0993&at=' + jour + 'T14:00');
ok('2e appel servi par le cache', appelsReseau === avant, `-> ${appelsReseau} appel(s) réseau au total`);

ok('lat manquante -> 400', (await appeler('?lon=1.1')).status === 400);
ok('lon manquante -> 400', (await appeler('?lat=49.4')).status === 400);
ok('lat vide -> 400', (await appeler('?lat=&lon=1.1')).status === 400);
ok('lat non numerique -> 400', (await appeler('?lat=nord&lon=1.1')).status === 400);
ok('lat hors bornes -> 400', (await appeler('?lat=200&lon=1.1')).status === 400);
ok('format at invalide -> 400', (await appeler('?lat=49.4&lon=1.1&at=hier')).status === 400);
ok('sans at -> instant courant accepté', (await appeler('?lat=49.4431&lon=1.0994')).status === 200);

const rb = await appeler('?lat=48.85&lon=2.35', { POINTS_AUTORISES: '49.44,1.10' });
ok('point non autorisé -> 403', rb.status === 403);
const ra = await appeler('?lat=49.45&lon=1.11', { POINTS_AUTORISES: '49.44,1.10 ; 48.85,2.35' });
ok('point autorisé -> 200', ra.status === 200);

/* --- Surface orientée --------------------------------------------------- */
const lire = async (qs) => (await (await appeler(qs)).json());
const q = `&at=${jour}T14:00`;

const horiz = await lire(`?lat=49.4431&lon=1.0993${q}`);
ok('sans paramètre : surface horizontale', horiz.surface.inclinaison_deg === 0
   && horiz.surface.orientation_cardinal === null, `-> score ${horiz.score}`);
ok('score horizontal = GHI brut', horiz.mesures.irradiance_surface_w_m2 === horiz.mesures.ghi_w_m2);

const sud = await lire(`?lat=49.4431&lon=1.0993${q}&inclinaison=90&orientation=180`);
const nord = await lire(`?lat=49.4431&lon=1.0993${q}&inclinaison=90&orientation=0`);
ok('façade sud renseignée', sud.surface.orientation_cardinal === 'S' && sud.surface.inclinaison_deg === 90);
ok('façade sud ensoleillée à 14 h', sud.soleil_direct === true, `-> score ${sud.score}`);
ok('façade nord non ensoleillée à 14 h', nord.soleil_direct === false, `-> score ${nord.score}`);
ok('façade sud mieux notée que façade nord', sud.score > nord.score,
   `-> ${sud.score} contre ${nord.score}`);
ok('décomposition du flux sur la surface',
   sud.mesures.surface_direct_w_m2 + sud.mesures.surface_diffus_w_m2
   + sud.mesures.surface_sol_w_m2 === sud.mesures.irradiance_surface_w_m2
   || Math.abs(sud.mesures.surface_direct_w_m2 + sud.mesures.surface_diffus_w_m2
   + sud.mesures.surface_sol_w_m2 - sud.mesures.irradiance_surface_w_m2) <= 2,
   `-> ${sud.mesures.surface_direct_w_m2} + ${sud.mesures.surface_diffus_w_m2} + ${sud.mesures.surface_sol_w_m2}`);
ok('angle d\'incidence remonté', typeof sud.geometrie.angle_incidence_deg === 'number',
   `-> ${sud.geometrie.angle_incidence_deg}°`);

const neige = await lire(`?lat=49.4431&lon=1.0993${q}&inclinaison=90&orientation=180&albedo=0.6`);
ok('albédo pris en compte', neige.mesures.surface_sol_w_m2 > sud.mesures.surface_sol_w_m2,
   `-> ${neige.mesures.surface_sol_w_m2} contre ${sud.mesures.surface_sol_w_m2} W/m²`);

const repli = await lire(`?lat=49.4431&lon=1.0993${q}&inclinaison=90&orientation=540`);
ok('orientation ramenée dans 0-360', repli.surface.orientation_deg === 180,
   `-> 540° devient ${repli.surface.orientation_deg}°`);

ok('inclinaison > 90 -> 400', (await appeler('?lat=49.4&lon=1.1&inclinaison=120')).status === 400);
ok('inclinaison négative -> 400', (await appeler('?lat=49.4&lon=1.1&inclinaison=-10')).status === 400);
ok('inclinaison non numérique -> 400', (await appeler('?lat=49.4&lon=1.1&inclinaison=mur')).status === 400);
ok('albédo hors bornes -> 400', (await appeler('?lat=49.4&lon=1.1&albedo=3')).status === 400);
ok('surfaces différentes -> entrées de cache distinctes',
   (await lire(`?lat=49.4431&lon=1.0993${q}&inclinaison=90&orientation=90`)).surface.orientation_deg === 90);

/* --- Pont IFTTT --------------------------------------------------------- */

const pont = await lire(`?lat=49.4431&lon=1.0993${q}&inclinaison=90&orientation=180&ifttt_evenement=soleil&ifttt_cle=CLE1`);
ok('pont IFTTT : déclenché et compte rendu dans la réponse', (() => {
  const u = new URL(urlIFTTTRecue);
  return pont.webhook_ifttt?.demande_envoyee === true
    && u.pathname === '/trigger/soleil/with/key/CLE1'
    && u.searchParams.get('value1') === String(pont.score);
})());
ok('ifttt_evenement sans ifttt_cle -> 400',
   (await appeler('?lat=49.4&lon=1.1&ifttt_evenement=soleil')).status === 400);
