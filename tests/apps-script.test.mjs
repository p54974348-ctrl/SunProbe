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
const urlsIFTTT = [];
let notificationNtfy = null;
let ntfyEnPanne = false;
let messageTelegram = null;
const UrlFetchApp = { fetch(url, options) {
  if (String(url).includes('maker.ifttt.com')) { urlIFTTTRecue = String(url); urlsIFTTT.push(String(url)); return { getContentText: () => 'Congratulations!' }; }
  if (String(url).includes('ntfy.sh')) {
    if (ntfyEnPanne) throw new Error('429 quota');
    notificationNtfy = { url: String(url), options }; return { getContentText: () => 'ok' };
  }
  if (String(url).includes('api.telegram.org')) { messageTelegram = { url: String(url), options }; return { getContentText: () => 'ok' }; }
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
const PropertiesService = { getScriptProperties: () => ({
  getProperty: (cle) => proprietes[cle] ?? null,
  setProperty: (cle, valeur) => { proprietes[cle] = String(valeur); },
  getProperties: () => ({ ...proprietes }),
}) };

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

/* --- Notification ntfy, au changement d'etat seulement ------------------ */

Object.assign(proprietes, { NTFY_SUJET: 'sonde-essai-7c2f' });
delete proprietes.ETAT_PRECEDENT;
notificationNtfy = null;

const premiere = gs.sondeProgrammee();
ok('changement d\'etat -> notification ntfy',
   notificationNtfy !== null && notificationNtfy.url.endsWith('/sonde-essai-7c2f')
   && notificationNtfy.options.method === 'post'
   && notificationNtfy.options.headers.Title.includes(premiere.etat)
   && /^[\x20-\x7e]*$/.test(notificationNtfy.options.headers.Title),
   `-> « ${notificationNtfy?.options.headers.Title} »`);

notificationNtfy = null;
urlIFTTTRecue = null;
gs.sondeProgrammee();
ok('etat inchange -> pas de notification, mais IFTTT part toujours',
   notificationNtfy === null && urlIFTTTRecue !== null);

/* --- Evenement nomme par l'etat : scenes SmartLife / Google Home --------- */

proprietes.IFTTT_EVENEMENT_ETAT = 'sonde';
delete proprietes.ETAT_PRECEDENT;
urlsIFTTT.length = 0;
const mesureEtat = gs.sondeProgrammee();
const cheminEtat = '/trigger/sonde_' + mesureEtat.etat.replace(/ /g, '_') + '/with/key/CLE2';
ok('changement d\'etat -> evenement IFTTT nomme par l\'etat',
   urlsIFTTT.some((u) => u.includes(cheminEtat)), `-> ${cheminEtat}`);

urlsIFTTT.length = 0;
gs.sondeProgrammee();
ok('etat inchange -> seul l\'evenement de mesure part, pas celui d\'etat',
   urlsIFTTT.length === 1 && urlsIFTTT[0].includes('/trigger/soleil_facade/'));

/* --- Plusieurs sondes : sept facades, un seul appel a la source ---------- */

const ORIENTATIONS = [0, 45, 90, 135, 180, 270, 315];
proprietes.SONDES = JSON.stringify(ORIENTATIONS.map((o, i) => ({
  nom: 'facade' + (i + 1), lat: 49.61, lon: 1.21, orientation: o,
})));
urlsIFTTT.length = 0;
notificationNtfy = null;
const avantMulti = appelsSource;

const resultats = gs.sondeProgrammee();
ok('sept sondes -> sept sorties, nommees et orientees',
   Array.isArray(resultats) && resultats.length === 7
   && resultats[0].point.libelle === 'facade1'
   && resultats.every((r, i) => r.surface.orientation_deg === ORIENTATIONS[i]
                                && r.surface.inclinaison_deg === 90));
ok('meme point -> un seul appel a la source pour les sept',
   appelsSource - avantMulti === 1, `-> ${appelsSource - avantMulti} appel(s)`);
ok('evenements d\'etat nommes par sonde',
   urlsIFTTT.some((u) => u.includes('/trigger/sonde_facade1_'))
   && urlsIFTTT.some((u) => u.includes('/trigger/sonde_facade7_')));
ok('memoire d\'etat par sonde',
   proprietes.ETAT_PRECEDENT_facade1 !== undefined
   && proprietes.ETAT_PRECEDENT_facade7 !== undefined);

/* --- Une propriete par sonde : SONDE_<nom> = « lat, lon, ... » ----------- */

delete proprietes.SONDES;
proprietes.SONDE_balcon = '49.62, 1.22, 210';
proprietes.SONDE_velux = '49.62, 1.22, 180, 20';
proprietes.SONDE_cour = '49.62, 1.22';
const parPropriete = gs.sondeProgrammee();
ok('SONDE_<nom> : trois proprietes -> trois sondes nommees, triees',
   Array.isArray(parPropriete) && parPropriete.length === 3
   && parPropriete.map((r) => r.point.libelle).join(',') === 'balcon,cour,velux');
ok('format positionnel : mur implicite, a plat, toit incline',
   parPropriete[0].surface.inclinaison_deg === 90 && parPropriete[0].surface.orientation_deg === 210
   && parPropriete[1].surface.inclinaison_deg === 0
   && parPropriete[2].surface.inclinaison_deg === 20 && parPropriete[2].surface.orientation_deg === 180);

proprietes.SONDE_cassee = '49.62, virgule,180';
let messageCassee = '';
try { gs.sondeProgrammee(); } catch (e) { messageCassee = String(e.message || e); }
ok('valeur illisible -> erreur qui nomme la sonde fautive', messageCassee.includes('cassee'));
delete proprietes.SONDE_cassee;

/* --- Canaux blindes : jeton ntfy, Telegram, panne ignoree ---------------- */

Object.keys(proprietes).filter((c) => c.startsWith('ETAT_PRECEDENT')).forEach((c) => delete proprietes[c]);
Object.assign(proprietes, { NTFY_JETON: 'tk_essai', TELEGRAM_JETON: '123:ABC', TELEGRAM_CHAT: '42' });
notificationNtfy = null;
messageTelegram = null;
gs.sondeProgrammee();
ok('jeton ntfy -> en-tete Authorization Bearer',
   notificationNtfy !== null && notificationNtfy.options.headers.Authorization === 'Bearer tk_essai');
ok('Telegram : sendMessage avec chat_id et texte',
   messageTelegram !== null && messageTelegram.url.includes('/bot123:ABC/sendMessage')
   && messageTelegram.options.payload.chat_id === '42'
   && String(messageTelegram.options.payload.text).includes('score'));
ok('les canaux demandent a ne pas lever d\'exception HTTP',
   notificationNtfy.options.muteHttpExceptions === true
   && messageTelegram.options.muteHttpExceptions === true);

Object.keys(proprietes).filter((c) => c.startsWith('ETAT_PRECEDENT')).forEach((c) => delete proprietes[c]);
ntfyEnPanne = true;
messageTelegram = null;
let sortiesMalgreLaPanne = null;
try { sortiesMalgreLaPanne = gs.sondeProgrammee(); } catch (e) { /* ne doit pas arriver */ }
ok('ntfy en panne (429) -> la mesure aboutit et Telegram part quand meme',
   Array.isArray(sortiesMalgreLaPanne) && sortiesMalgreLaPanne.length > 0 && messageTelegram !== null);
ntfyEnPanne = false;
