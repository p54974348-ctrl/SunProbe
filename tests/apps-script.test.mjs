/**
 * La version Google Apps Script duplique le noyau (pas de modules ES chez
 * Google), comme le prototype. Ce test verifie qu'elle ne DIVERGE pas :
 * concordance numerique avec les modules, puis enveloppe doGet exercee
 * avec des services Google simules — aucun acces reseau.
 */
import { readFileSync } from 'node:fs';
import { positionSolaire } from '../src/core/solar-position.js';
import { irradianceSurPlan } from '../src/core/plan.js';
import { ghiCielClair } from '../src/core/clear-sky.js';
import { ensoleillementJournalier } from '../src/core/ensoleillement.js';

const ok = (n, c, i = '') => { console.log(`${c ? 'PASS' : 'ECHEC'}  ${n} ${i}`); if (!c) process.exitCode = 1; };

const source = readFileSync(new URL('../apps-script/sunprobe.gs', import.meta.url), 'utf8');

/* --- Services Google simules ------------------------------------------- */

const jour = new Date().toISOString().slice(0, 10);
const heures = Array.from({ length: 24 }, (_, h) => `${jour}T${String(h).padStart(2, '0')}:00`);
const previsions = {
  latitude: 49.44, longitude: 1.1, elevation: 32,
  utc_offset_seconds: 7200, timezone: 'Europe/Paris',
  hourly: { time: heures,
    shortwave_radiation: heures.map((_, h) => Math.max(0, Math.round(820 * Math.sin(((h - 6) / 12) * Math.PI)))),
    direct_normal_irradiance: heures.map(() => 700),
    diffuse_radiation: heures.map(() => 120),
    cloud_cover: heures.map(() => 18) },
};

let appelsSource = 0;
let urlIFTTTRecue = null;
const UrlFetchApp = { fetch(url) {
  if (String(url).includes('maker.ifttt.com')) { urlIFTTTRecue = String(url); return { getContentText: () => 'Congratulations!' }; }
  appelsSource++;
  return { getContentText: () => JSON.stringify(previsions) };
} };
const ContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput(texte) { return { texte, mime: null, setMimeType(m) { this.mime = m; return this; } }; },
};
const magasin = new Map();
const CacheService = { getScriptCache: () => ({
  get: (cle) => magasin.get(cle) ?? null,
  put: (cle, valeur) => { magasin.set(cle, valeur); },
}) };
const proprietes = {};
const PropertiesService = { getScriptProperties: () => ({ getProperty: (cle) => proprietes[cle] ?? null }) };

let gs;
ok('apps-script : syntaxe JavaScript valide et executable', (() => {
  try {
    const executer = new Function('UrlFetchApp', 'ContentService', 'CacheService', 'PropertiesService',
      `${source}\n; return { positionSolaire, ghiCielClair, irradianceSurPlan, ensoleillementJournalier, doGet, sondeProgrammee };`);
    gs = executer(UrlFetchApp, ContentService, CacheService, PropertiesService);
    return typeof gs.doGet === 'function';
  } catch (e) { console.log('   ', e.message); return false; }
})());

/* --- Concordance numerique avec les modules ---------------------------- */

const lat = 49.4431, lon = 1.0993;
let ecartPosition = 0, ecartClair = 0, ecartPoa = 0, cas = 0;
for (const mois of [0, 3, 5, 8, 11]) {
  for (const heure of [6, 9, 12, 15, 18]) {
    const instant = new Date(Date.UTC(2026, mois, 15, heure, 0));
    const a = positionSolaire(instant, lat, lon);
    const b = gs.positionSolaire(instant, lat, lon);
    ecartPosition = Math.max(ecartPosition, Math.abs(a.hauteur - b.hauteur), Math.abs(a.azimut - b.azimut));
    ecartClair = Math.max(ecartClair, Math.abs(ghiCielClair(a.hauteur) - gs.ghiCielClair(a.hauteur)));
    for (const [inc, ori] of [[0, 180], [30, 180], [90, 180], [90, 0], [90, 333], [45, 270]]) {
      const entree = { ghi: 600, dni: 750, dhi: 110, hauteurDeg: a.hauteur,
                       azimutSoleilDeg: a.azimut, inclinaisonDeg: inc, orientationDeg: ori, instant };
      ecartPoa = Math.max(ecartPoa, Math.abs(irradianceSurPlan(entree).poa - gs.irradianceSurPlan(entree).poa));
      cas++;
    }
  }
}
ok('position solaire et ciel clair identiques aux modules',
   ecartPosition < 1e-9 && ecartClair < 1e-9, `-> ecart max ${ecartPosition.toExponential(1)}`);
ok('irradiance sur plan identique aux modules', ecartPoa < 1e-9,
   `-> ecart max ${ecartPoa.toExponential(1)} W/m² sur ${cas} configurations`);

let ensPareil = true;
for (const [moisE, decalageH] of [[5, 2], [11, 1]]) {
  const serie = Array.from({ length: 24 }, (_, h) => ({
    instant: new Date(Date.UTC(2026, moisE, 15, h) - decalageH * 3600000),
    dni: h % 3 === 0 ? 40 : 600,
  }));
  for (const [inc, ori] of [[0, 180], [90, 180], [90, 333]]) {
    const a = ensoleillementJournalier({ serieJour: serie, latitude: lat, longitude: lon,
      surface: { inclinaisonDeg: inc, orientationDeg: ori } });
    const b = gs.ensoleillementJournalier({ serieJour: serie, latitude: lat, longitude: lon,
      inclinaisonDeg: inc, orientationDeg: ori });
    if (a.pourcentage !== b.pourcentage) ensPareil = false;
  }
}
ok('ensoleillement journalier identique aux modules', ensPareil);

/* --- Enveloppe doGet ---------------------------------------------------- */

const appeler = (parametres) => JSON.parse(gs.doGet({ parameter: parametres }).texte);

const sortie = appeler({ lat: '49.4431', lon: '1.0993', at: `${jour}T14:00`, inclinaison: '90', orientation: '180' });
ok('doGet : sortie au contrat, version 1',
   sortie.version === 1 && ['plein soleil', 'soleil faible', 'ombre', 'nuit'].includes(sortie.etat)
   && sortie.surface.orientation_cardinal === 'S' && sortie.ensoleillement_jour.pourcentage !== undefined,
   `-> ${sortie.etat} / ${sortie.score}`);
ok('doGet : reponse annoncee en JSON',
   gs.doGet({ parameter: { lat: '49.4431', lon: '1.0993' } }).mime === 'application/json');

const avant = appelsSource;
appeler({ lat: '49.4431', lon: '1.0993', at: `${jour}T14:00`, inclinaison: '90', orientation: '180' });
ok('doGet : cache actif, la source n\'est pas rappelee', appelsSource === avant,
   `-> ${appelsSource} appel(s) a la source`);

ok('doGet : lat manquante -> erreur explicite', appeler({ lon: '1.1' }).erreur !== undefined);
ok('doGet : lat vide -> erreur (piege n° 2)', appeler({ lat: '', lon: '1.1' }).erreur !== undefined);
ok('doGet : ifttt_evenement sans cle -> erreur',
   appeler({ lat: '49.4', lon: '1.1', ifttt_evenement: 'soleil' }).erreur !== undefined);

const pont = appeler({ lat: '49.4431', lon: '1.0993', at: `${jour}T14:00`, inclinaison: '90',
  orientation: '180', ifttt_evenement: 'soleil_facade', ifttt_cle: 'CLE1' });
ok('doGet : pont IFTTT declenche, meme sur cache, avec compte rendu', (() => {
  const u = new URL(urlIFTTTRecue);
  return pont.webhook_ifttt?.demande_envoyee === true
    && u.pathname === '/trigger/soleil_facade/with/key/CLE1'
    && u.searchParams.get('value1') === String(pont.score)
    && u.searchParams.get('value2') === pont.etat;
})());

/* --- Sonde programmee --------------------------------------------------- */

urlIFTTTRecue = null;
Object.assign(proprietes, { LAT: '49.4431', LON: '1.0993', ORIENTATION: '333',
  IFTTT_EVENEMENT: 'soleil_facade', IFTTT_CLE: 'CLE2' });
const programmee = gs.sondeProgrammee();
ok('sondeProgrammee : mur vertical implicite et Webhook declenche',
   programmee.surface.inclinaison_deg === 90 && programmee.surface.orientation_deg === 333
   && urlIFTTTRecue !== null && urlIFTTTRecue.includes('/trigger/soleil_facade/with/key/CLE2'),
   `-> ${programmee.etat} / ${programmee.score}`);
