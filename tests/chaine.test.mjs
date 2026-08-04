/**
 * Test de bout en bout du pipeline partage (src/sonde.js),
 * avec une reponse Open-Meteo simulee. Aucun acces reseau.
 */
import { sonder } from '../src/sonde.js';

const ok = (n, c, i = '') => { console.log(`${c ? 'PASS' : 'ECHEC'}  ${n} ${i}`); if (!c) process.exitCode = 1; };

const jour = new Date().toISOString().slice(0, 10);
const heures = Array.from({ length: 24 }, (_, h) => `${jour}T${String(h).padStart(2, '0')}:00`);
const courbe = (h) => Math.max(0, Math.round(820 * Math.sin(((h - 6) / 12) * Math.PI)));

globalThis.fetch = async (url) => {
  const u = new URL(url);
  ok('URL : variables de rayonnement demandees',
     u.searchParams.get('hourly').includes('shortwave_radiation'));
  ok('URL : fuseau du point demande', u.searchParams.get('timezone') === 'auto');
  return { ok: true, status: 200, json: async () => ({
    latitude: 49.44, longitude: 1.1, elevation: 32,
    utc_offset_seconds: 7200, timezone: 'Europe/Paris',
    hourly: {
      time: heures,
      shortwave_radiation: heures.map((_, h) => courbe(h)),
      direct_normal_irradiance: heures.map((_, h) => Math.round(courbe(h) * 1.1)),
      diffuse_radiation: heures.map((_, h) => Math.round(courbe(h) * 0.18)),
      cloud_cover: heures.map(() => 18),
    },
  })};
};

const commun = { latitude: 49.4431, longitude: 1.0993, at: `${jour}T14:00`, libelle: 'Rouen' };
const { sortie, serieJour, indexJour } = await sonder(commun);

ok('24 pas extraits pour le graphique', serieJour.length === 24);
ok('pas retenu localise dans la journee', indexJour >= 0 && indexJour < 24, `-> index ${indexJour}`);
ok('instant reconstruit en UTC', sortie.horodatage_utc.startsWith(`${jour}T12:00`),
   `-> ${sortie.horodatage_utc}`);
ok('altitude et fuseau remontes', sortie.point.altitude_m === 32 && sortie.fuseau === 'Europe/Paris');

ok('contrat : champs obligatoires presents',
   ['version','horodatage_utc','point','surface','etat','score','soleil_direct','mesures','geometrie','source','fraicheur']
     .every((k) => k in sortie));
ok('contrat : version = 1', sortie.version === 1);
ok('contrat : etat valide',
   ['plein soleil','soleil faible','ombre','nuit'].includes(sortie.etat), `-> ${sortie.etat}`);
ok('contrat : score dans 0-100', sortie.score >= 0 && sortie.score <= 100, `-> ${sortie.score}`);
ok('contrat : serialisable en JSON', typeof JSON.stringify(sortie) === 'string');
ok('azimut cardinal renseigne', /^[NSEO]{1,3}$/.test(sortie.geometrie.azimut_cardinal),
   `-> ${sortie.geometrie.azimut_cardinal}`);

/* --- Par defaut : horizontal, comportement d'origine --- */
ok('surface par defaut horizontale', sortie.surface.inclinaison_deg === 0);
ok('score horizontal porte sur le GHI brut',
   sortie.mesures.irradiance_surface_w_m2 === sortie.mesures.ghi_w_m2,
   `-> ${sortie.mesures.ghi_w_m2} W/m²`);
ok('pas d\'orientation cardinale quand la surface est horizontale',
   sortie.surface.orientation_cardinal === null);

/* --- Surface orientee --- */
const sud = (await sonder({ ...commun, surface: { inclinaisonDeg: 90, orientationDeg: 180 } })).sortie;
const nord = (await sonder({ ...commun, surface: { inclinaisonDeg: 90, orientationDeg: 0 } })).sortie;
const toit = (await sonder({ ...commun, surface: { inclinaisonDeg: 30, orientationDeg: 180 } })).sortie;

ok('facade sud : soleil sur la face', sud.soleil_direct === true, `-> score ${sud.score}`);
ok('facade nord : soleil derriere', nord.soleil_direct === false, `-> score ${nord.score}`);
ok('toit incline sud mieux note que facade verticale sud a 14 h',
   toit.score > sud.score, `-> toit ${toit.score} contre mur ${sud.score}`);
ok('somme des composantes = irradiance surface',
   Math.abs(sud.mesures.surface_direct_w_m2 + sud.mesures.surface_diffus_w_m2
     + sud.mesures.surface_sol_w_m2 - sud.mesures.irradiance_surface_w_m2) <= 2);
ok('mesures horizontales conservees en parallele',
   sud.mesures.ghi_w_m2 === sortie.mesures.ghi_w_m2);
ok('clarte du ciel independante de la surface',
   sud.geometrie.indice_ciel_clair === nord.geometrie.indice_ciel_clair);

/* --- Sans horodatage : instant courant dans le fuseau du point --- */
const maintenant = (await sonder({ latitude: 49.4431, longitude: 1.0993 })).sortie;
ok('sans at : horodatage local renseigne',
   /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(maintenant.horodatage_local),
   `-> ${maintenant.horodatage_local}`);

console.log('\n' + JSON.stringify(sud, null, 2));
