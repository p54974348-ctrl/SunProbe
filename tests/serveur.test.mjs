/**
 * Test du service Node : vraies requetes HTTP sur localhost,
 * source de donnees simulee. Aucun acces reseau externe.
 */
const ok = (n, c, i = '') => { console.log(`${c ? 'PASS' : 'ECHEC'}  ${n} ${i}`); if (!c) process.exitCode = 1; };

const jour = new Date().toISOString().slice(0, 10);
const heures = Array.from({ length: 24 }, (_, h) => `${jour}T${String(h).padStart(2, '0')}:00`);
let appels = 0;
const vraiFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes('127.0.0.1')) return vraiFetch(url);
  appels++;
  return { ok: true, status: 200, json: async () => ({
    latitude: 49.44, longitude: 1.1, elevation: 32,
    utc_offset_seconds: 7200, timezone: 'Europe/Paris',
    hourly: { time: heures,
      shortwave_radiation: heures.map((_, h) => Math.max(0, Math.round(820 * Math.sin(((h - 6) / 12) * Math.PI)))),
      direct_normal_irradiance: heures.map(() => 700),
      diffuse_radiation: heures.map(() => 120),
      cloud_cover: heures.map(() => 18) } }) };
};

process.env.PORT = '8799';
process.env.HOST = '127.0.0.1';
await import('../server/sunprobe-api.mjs');
await new Promise((r) => setTimeout(r, 120));

const base = 'http://127.0.0.1:8799';
const get = (chemin) => vraiFetch(base + chemin);

let r = await get('/health');
ok('/health repond 200', r.status === 200);

r = await get(`/api/v1/ensoleillement?lat=49.4431&lon=1.0993&at=${jour}T14:00`);
const corps = await r.json();
ok('mesure: 200', r.status === 200);
ok('mesure: etat valide', ['plein soleil', 'soleil faible', 'ombre', 'nuit'].includes(corps.etat),
   `-> ${corps.etat} / ${corps.score}`);
ok('mesure: CORS ouvert', r.headers.get('access-control-allow-origin') === '*');

const avant = appels;
await get(`/api/v1/ensoleillement?lat=49.4431&lon=1.0993&at=${jour}T14:00`);
ok('cache memoire actif', appels === avant, `-> ${appels} appel(s) a la source`);

ok('lat manquante -> 400', (await get('/api/v1/ensoleillement?lon=1.1')).status === 400);
ok('lon manquante -> 400', (await get('/api/v1/ensoleillement?lat=49.4')).status === 400);
ok('lat vide -> 400', (await get('/api/v1/ensoleillement?lat=&lon=1.1')).status === 400);
ok('at mal forme -> 400', (await get('/api/v1/ensoleillement?lat=49.4&lon=1.1&at=demain')).status === 400);
ok('route inconnue -> 404', (await get('/nimporte-quoi')).status === 404);
ok('sans at -> instant courant', (await get('/api/v1/ensoleillement?lat=49.44&lon=1.10')).status === 200);

/* --- Surface orientee --- */
const lire = async (qs) => (await get('/api/v1/ensoleillement' + qs)).json();
const q = `?lat=49.4431&lon=1.0993&at=${jour}T14:00`;

const h = await lire(q);
const sud = await lire(q + '&inclinaison=90&orientation=180');
const nord = await lire(q + '&inclinaison=90&orientation=0');

ok('sans parametre : surface horizontale', h.surface.inclinaison_deg === 0, `-> score ${h.score}`);
ok('facade sud ensoleillee a 14 h', sud.soleil_direct === true, `-> score ${sud.score}`);
ok('facade nord non ensoleillee', nord.soleil_direct === false, `-> score ${nord.score}`);
ok('les deux APIs donnent le meme resultat', sud.score > nord.score);
ok('cache distinct par surface', sud.surface.orientation_deg !== nord.surface.orientation_deg);
ok('inclinaison invalide -> 400',
   (await get('/api/v1/ensoleillement?lat=49.4&lon=1.1&inclinaison=200')).status === 400);
ok('la route inconnue documente les parametres',
   Object.keys((await (await get('/inconnu')).json()).parametres).includes('orientation'));

process.exit(process.exitCode || 0);
