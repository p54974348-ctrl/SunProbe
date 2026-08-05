/**
 * SunProbe — API sur Google Apps Script.
 *
 * Hébergement gratuit chez Google, sans serveur ni carte bancaire, qui
 * répond en vrai JSON : de quoi être interrogé par IFTTT, Home Assistant
 * ou un simple curl. Mêmes paramètres et même sortie que les autres API
 * du projet (service Node, fonction Cloudflare).
 *
 * ── Mise en service, une fois ─────────────────────────────────────────────
 *   1. https://script.google.com → Nouveau projet.
 *   2. Coller l'intégralité de ce fichier à la place du contenu.
 *   3. Déployer → Nouveau déploiement → type « Application Web » :
 *        - Exécuter en tant que : Moi
 *        - Accès : Tout le monde
 *   4. Copier l'URL fournie (…/exec). L'API répond sur :
 *        …/exec?lat=49.4431&lon=1.0993&orientation=329
 *      (Google répond par une redirection 302 : un client doit la suivre —
 *       IFTTT et curl -L le font.)
 *
 * ── Sonde programmée, sans IFTTT « aller » ────────────────────────────────
 *   Apps Script sait aussi se déclencher tout seul : renseigner les
 *   propriétés du script (Paramètres du projet → Propriétés du script)
 *   LAT, LON, ORIENTATION, INCLINAISON (facultatif), IFTTT_EVENEMENT,
 *   IFTTT_CLE, puis Déclencheurs → Ajouter : fonction `sondeProgrammee`,
 *   horaire, toutes les heures. La sonde mesure et pousse vers IFTTT sans
 *   qu'aucun service n'ait à l'appeler.
 *
 * ── Pourquoi ce fichier duplique le noyau ─────────────────────────────────
 *   Apps Script n'accepte pas les modules ES. Comme le prototype, ce
 *   fichier recopie donc les fonctions de calcul, et le test
 *   tests/apps-script.test.mjs vérifie qu'il ne diverge pas des modules
 *   (écart toléré nul). Toute modification du noyau doit être répercutée
 *   ici — c'est le même piège n° 4 que pour le prototype.
 *
 * Quotas Google (compte gratuit) : 20 000 appels UrlFetchApp/jour,
 * 90 min d'exécution/jour — très au-dessus d'un usage domotique.
 * Données : Open-Meteo (CC BY 4.0), moins de 10 000 appels/jour.
 */

/* ---------------------------------------------------------------- calcul
   Copié du prototype (et donc des modules) — ne pas « améliorer » ici. */

const DEG = Math.PI / 180, RAD = 180 / Math.PI;
const borner = (v, a, b) => Math.min(b, Math.max(a, v));
const mod360 = v => ((v % 360) + 360) % 360;

function positionSolaire(instant, lat, lon) {
  const n = instant.getTime()/86400000 + 2440587.5 - 2451545.0;
  const L = mod360(280.46 + 0.9856474*n);
  const g = mod360(357.528 + 0.9856003*n);
  const lambda = L + 1.915*Math.sin(g*DEG) + 0.02*Math.sin(2*g*DEG);
  const eps = 23.439 - 0.0000004*n;
  const decl = Math.asin(borner(Math.sin(eps*DEG)*Math.sin(lambda*DEG),-1,1))*RAD;
  const ra = Math.atan2(Math.cos(eps*DEG)*Math.sin(lambda*DEG), Math.cos(lambda*DEG))*RAD;
  const eqt = (mod360(L - ra + 180) - 180) * 4;
  const hUtc = instant.getUTCHours() + instant.getUTCMinutes()/60;
  const tsv = (hUtc*60 + eqt + 4*lon + 1440) % 1440;
  const H = tsv/4 - 180;
  const sinAlt = Math.sin(lat*DEG)*Math.sin(decl*DEG)
               + Math.cos(lat*DEG)*Math.cos(decl*DEG)*Math.cos(H*DEG);
  const alt = Math.asin(borner(sinAlt,-1,1))*RAD;
  const refr = alt < -1 ? 0 : 1.02/Math.tan((alt + 10.3/(alt+5.11))*DEG)/60;
  let az = Math.acos(borner(
    (Math.sin(decl*DEG) - Math.sin(alt*DEG)*Math.sin(lat*DEG))/(Math.cos(alt*DEG)*Math.cos(lat*DEG)),
    -1, 1))*RAD;
  if (H > 0) az = 360 - az;
  return { hauteur: alt + refr, azimut: mod360(az) };
}

const cardinal = az => ['N','NNE','NE','ENE','E','ESE','SE','SSE',
  'S','SSO','SO','OSO','O','ONO','NO','NNO'][Math.round(mod360(az)/22.5)%16];

const ghiCielClair = hauteurDeg => {
  const c = Math.sin(hauteurDeg*DEG);
  return c <= 0 ? 0 : 1098*c*Math.exp(-0.059/c);
};

const GHI_PLEINE_ECHELLE = 900;

function irradianceExtraterrestre(instant) {
  const j = Math.floor((instant - Date.UTC(instant.getUTCFullYear(),0,1))/86400000) + 1;
  return 1361 * (1 + 0.033*Math.cos(2*Math.PI*j/365));
}

function irradianceSurPlan({ ghi, dni, dhi, hauteurDeg, azimutSoleilDeg,
                             inclinaisonDeg, orientationDeg, albedo = 0.2, instant }) {
  const h = hauteurDeg*DEG, b = inclinaisonDeg*DEG;
  const cosTheta = borner(Math.sin(h)*Math.cos(b)
                   + Math.cos(h)*Math.sin(b)*Math.cos((azimutSoleilDeg-orientationDeg)*DEG), -1, 1);
  const leve = hauteurDeg > 0, direct = leve && cosTheta > 0;
  const angle = Math.acos(cosTheta)*RAD;

  if (inclinaisonDeg === 0)
    return { poa: Math.max(0, ghi||0), direct:0, diffus:0, sol:0, angle, soleilDirect:direct };

  const rapport = leve ? Math.max(0, cosTheta)/Math.max(0.02, Math.sin(h)) : 0;
  const ani = leve ? borner((dni||0)/irradianceExtraterrestre(instant), 0, 1) : 0;
  const d = direct ? (dni||0)*cosTheta : 0;
  const df = Math.max(0, dhi||0) * (ani*rapport + (1-ani)*(1+Math.cos(b))/2);
  const sol = Math.max(0, ghi||0) * albedo * (1-Math.cos(b))/2;
  return { poa: Math.max(0, d+df+sol), direct:d, diffus:df, sol, angle, soleilDirect:direct };
}

function completerComposantes({ ghi, dni, dhi, hauteurDeg, instant }) {
  const sinH = Math.sin(hauteurDeg*DEG);
  if (!isFinite(ghi) || sinH <= 0.02) return { ghi:ghi||0, dni:dni||0, dhi:dhi??Math.max(0,ghi||0) };
  if (isFinite(dni) && isFinite(dhi)) return { ghi, dni, dhi };
  const kt = borner(ghi/(irradianceExtraterrestre(instant)*sinH), 0, 1);
  const fd = kt <= 0.22 ? 1-0.09*kt
           : kt <= 0.8 ? 0.9511-0.1604*kt+4.388*kt**2-16.638*kt**3+12.336*kt**4
           : 0.165;
  const dhiE = isFinite(dhi) ? dhi : ghi*borner(fd,0,1);
  return { ghi, dni: isFinite(dni) ? dni : Math.max(0,(ghi-dhiE)/sinH), dhi: dhiE };
}

const SEUIL_ENSOLEILLEMENT_W_M2 = 120;
function ensoleillementJournalier({ serieJour, latitude, longitude, inclinaisonDeg = 0, orientationDeg = 180 }) {
  let dureeJourH = 0, dureeSoleilH = 0;
  for (const pas of serieJour) {
    const milieu = new Date(pas.instant.getTime() - 1800000);
    const { hauteur, azimut } = positionSolaire(milieu, latitude, longitude);
    if (hauteur <= 0) continue;
    dureeJourH++;
    if ((pas.dni ?? 0) < SEUIL_ENSOLEILLEMENT_W_M2) continue;
    const cosTheta = Math.sin(hauteur*DEG)*Math.cos(inclinaisonDeg*DEG)
      + Math.cos(hauteur*DEG)*Math.sin(inclinaisonDeg*DEG)*Math.cos((azimut-orientationDeg)*DEG);
    if (cosTheta > 0) dureeSoleilH++;
  }
  return { pourcentage: dureeJourH === 0 ? null : Math.round(100*dureeSoleilH/dureeJourH),
           duree_soleil_h: dureeSoleilH, duree_jour_h: dureeJourH };
}

function evaluer(plan, ghi, hauteurDeg) {
  const clair = ghiCielClair(hauteurDeg);
  const kc = clair < 5 ? null : Number(Math.min(1.15, (ghi||0)/clair).toFixed(3));
  if (hauteurDeg <= -0.833) return { score:0, etat:'nuit', clair:0, kc:null, direct:false };
  const score = Math.round(100 * Math.min(1, Math.max(0, plan.poa) / GHI_PLEINE_ECHELLE));
  const etat = score >= 60 ? 'plein soleil' : score >= 20 ? 'soleil faible' : 'ombre';
  return { score, etat, clair: Math.round(clair), kc, direct: plan.soleilDirect };
}

/* ----------------------------------------------------- lecture des paramètres
   Number('') et Number(null) valent 0 (piège n° 2) : vide = refusé. */

const nombreStrict = v => (v === null || v === undefined || String(v).trim() === '' ? NaN : Number(v));

function lireParametres(p) {
  const latitude = nombreStrict(p.lat);
  const longitude = nombreStrict(p.lon);
  if (!isFinite(latitude) || Math.abs(latitude) > 90)
    return { erreur: 'Paramètre lat requis : latitude en degrés décimaux, entre -90 et 90.' };
  if (!isFinite(longitude) || Math.abs(longitude) > 180)
    return { erreur: 'Paramètre lon requis : longitude en degrés décimaux, entre -180 et 180.' };

  const at = p.at ?? null;
  if (at !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at))
    return { erreur: 'Format attendu pour at : AAAA-MM-JJTHH:MM, en heure locale du point.' };

  let inclinaisonDeg = 0;
  if (p.inclinaison !== undefined) {
    inclinaisonDeg = nombreStrict(p.inclinaison);
    if (!isFinite(inclinaisonDeg) || inclinaisonDeg < 0 || inclinaisonDeg > 90)
      return { erreur: 'Paramètre inclinaison : de 0 à 90 degrés. 0 = horizontal, 90 = vertical.' };
  }
  let orientationDeg = 180;
  if (p.orientation !== undefined) {
    const brut = nombreStrict(p.orientation);
    if (!isFinite(brut))
      return { erreur: 'Paramètre orientation : azimut en degrés depuis le nord. 90 = E, 180 = S, 270 = O.' };
    orientationDeg = mod360(brut);
  }
  let albedo = 0.2;
  if (p.albedo !== undefined) {
    albedo = nombreStrict(p.albedo);
    if (!isFinite(albedo) || albedo < 0 || albedo > 1)
      return { erreur: 'Paramètre albedo : réflectivité du sol entre 0 et 1.' };
  }

  const aEvenement = p.ifttt_evenement !== undefined, aCle = p.ifttt_cle !== undefined;
  if (aEvenement !== aCle)
    return { erreur: 'Les paramètres ifttt_evenement et ifttt_cle vont ensemble.' };
  let ifttt = null;
  if (aEvenement) {
    if (String(p.ifttt_evenement).trim() === '' || String(p.ifttt_cle).trim() === '')
      return { erreur: 'Paramètres ifttt_evenement et ifttt_cle : non vides quand ils sont fournis.' };
    ifttt = { evenement: String(p.ifttt_evenement).trim(), cle: String(p.ifttt_cle).trim() };
  }

  return { valeurs: { latitude, longitude, at, inclinaisonDeg, orientationDeg, albedo, ifttt } };
}

/* ------------------------------------------------------------------ mesure */

/* Mémo d'exécution : plusieurs sondes du même point partagent la même
   réponse Open-Meteo — 7 façades d'un bâtiment = 1 appel à la source. */
const memoPrevisions = {};
function recupererPrevisions(url) {
  if (!(url in memoPrevisions)) {
    memoPrevisions[url] = JSON.parse(UrlFetchApp.fetch(url).getContentText());
  }
  return memoPrevisions[url];
}

function mesurer({ latitude, longitude, at, inclinaisonDeg, orientationDeg, albedo }) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const dateVisee = at ? at.slice(0, 10) : aujourdhui;
  const ecart = Math.round((Date.parse(dateVisee + 'T12:00:00Z')
    - Date.parse(aujourdhui + 'T12:00:00Z')) / 86400000);
  if (ecart < -92 || ecart > 15) throw new Error('Date hors portée : -92 à +15 jours.');

  const requete = 'https://api.open-meteo.com/v1/forecast'
    + '?latitude=' + latitude.toFixed(4) + '&longitude=' + longitude.toFixed(4)
    + '&hourly=shortwave_radiation,direct_normal_irradiance,diffuse_radiation,cloud_cover'
    + '&timezone=auto&forecast_days=' + Math.min(16, Math.max(2, ecart + 2))
    + (ecart < 0 ? '&past_days=' + Math.min(92, Math.abs(ecart) + 1) : '');

  const d = recupererPrevisions(requete);
  if (d.error) throw new Error(d.reason || 'Requête refusée par la source.');
  const h = d.hourly;
  if (!h || !h.time || !h.time.length) throw new Error('La source n’a renvoyé aucune donnée.');

  const decalage = d.utc_offset_seconds || 0;
  // Sans at : maintenant, dans le fuseau du point — jamais celui du serveur.
  const vise = at ?? new Date(Date.now() + decalage * 1000).toISOString().slice(0, 16);

  // Le rayonnement est moyenné sur l'heure PRÉCÉDANT l'estampille (piège n° 1).
  let i = h.time.findIndex(t => Date.parse(t + ':00Z') >= Date.parse(vise + ':00Z'));
  let fraicheur = 'ok';
  if (i === -1) { i = h.time.length - 1; fraicheur = 'approchee'; }
  if (h.shortwave_radiation[i] === null) {
    const j = [i-1, i+1, i-2, i+2].find(k => h.shortwave_radiation?.[k] != null);
    if (j !== undefined) { i = j; fraicheur = 'approchee'; } else fraicheur = 'indisponible';
  }

  const instant = new Date(Date.parse(vise + ':00Z') - decalage * 1000);
  const geo = positionSolaire(instant, d.latitude, d.longitude);
  const ghi = h.shortwave_radiation[i] ?? 0;

  const comp = completerComposantes({ ghi, dni: h.direct_normal_irradiance?.[i],
    dhi: h.diffuse_radiation?.[i], hauteurDeg: geo.hauteur, instant });
  const plan = irradianceSurPlan({ ...comp, hauteurDeg: geo.hauteur, azimutSoleilDeg: geo.azimut,
    inclinaisonDeg, orientationDeg, albedo, instant });
  const ev = evaluer(plan, ghi, geo.hauteur);

  const jourLocal = vise.slice(0, 10);
  const ens = ensoleillementJournalier({
    serieJour: h.time.map((t, k) => ({ t, k })).filter(x => x.t.startsWith(jourLocal))
      .map(x => ({ instant: new Date(Date.parse(x.t + ':00Z') - decalage * 1000),
                   dni: h.direct_normal_irradiance?.[x.k] })),
    latitude: d.latitude, longitude: d.longitude, inclinaisonDeg, orientationDeg,
  });

  return {
    version: 1,
    horodatage_utc: instant.toISOString(),
    horodatage_local: vise,
    fuseau: d.timezone || null,
    point: { latitude: +d.latitude.toFixed(5), longitude: +d.longitude.toFixed(5),
             altitude_m: d.elevation ?? null, libelle: null },
    surface: { inclinaison_deg: inclinaisonDeg, orientation_deg: orientationDeg,
               orientation_cardinal: inclinaisonDeg > 0 ? cardinal(orientationDeg) : null,
               albedo },
    etat: ev.etat,
    score: ev.score,
    soleil_direct: ev.direct,
    ensoleillement_jour: ens,
    mesures: {
      irradiance_surface_w_m2: Math.round(plan.poa),
      surface_direct_w_m2: Math.round(plan.direct),
      surface_diffus_w_m2: Math.round(plan.diffus),
      surface_sol_w_m2: Math.round(plan.sol),
      ghi_w_m2: Math.round(ghi),
      dni_w_m2: h.direct_normal_irradiance?.[i] == null ? null : Math.round(h.direct_normal_irradiance[i]),
      dhi_w_m2: h.diffuse_radiation?.[i] == null ? null : Math.round(h.diffuse_radiation[i]),
      couverture_nuageuse_pct: h.cloud_cover?.[i] ?? null,
    },
    geometrie: {
      hauteur_deg: +geo.hauteur.toFixed(2), azimut_deg: +geo.azimut.toFixed(2),
      azimut_cardinal: cardinal(geo.azimut),
      angle_incidence_deg: +plan.angle.toFixed(2),
      ghi_ciel_clair_w_m2: ev.clair, indice_ciel_clair: ev.kc,
    },
    source: 'open-meteo',
    fraicheur,
  };
}

/* -------------------------------------------------------------- pont IFTTT
   IFTTT ne lit pas la réponse d'une « web request » : c'est la sonde qui
   déclenche l'événement, avec les trois champs pilotes en value1/2/3. */

function declencherIFTTT(evenement, cle, sortie) {
  const url = 'https://maker.ifttt.com/trigger/' + encodeURIComponent(evenement)
    + '/with/key/' + encodeURIComponent(cle)
    + '?value1=' + encodeURIComponent(sortie.score)
    + '&value2=' + encodeURIComponent(sortie.etat)
    + '&value3=' + encodeURIComponent(String(sortie.soleil_direct));
  UrlFetchApp.fetch(url);
}

function sortieAvecPontIFTTT(sortie, ifttt) {
  if (!ifttt) return sortie;
  let envoyee = true;
  try { declencherIFTTT(ifttt.evenement, ifttt.cle, sortie); } catch (e) { envoyee = false; }
  return { ...sortie, webhook_ifttt: { evenement: ifttt.evenement, demande_envoyee: envoyee } };
}

/* ---------------------------------------------------------------- enveloppe */

const CACHE_SECONDES = 300; // la météo change lentement, IFTTT peut insister

function doGet(e) {
  const json = (corps) => ContentService
    .createTextOutput(JSON.stringify(corps, null, 2))
    .setMimeType(ContentService.MimeType.JSON);

  const lecture = lireParametres((e && e.parameter) || {});
  if (lecture.erreur) return json({ erreur: lecture.erreur });

  const v = lecture.valeurs;
  try {
    const cache = CacheService.getScriptCache();
    const cle = ['sonde', v.latitude.toFixed(3), v.longitude.toFixed(3),
      v.at ?? 'maintenant', v.inclinaisonDeg, v.orientationDeg, v.albedo].join('|');

    let sortie = null;
    const enCache = cache.get(cle);
    if (enCache) sortie = JSON.parse(enCache);
    else {
      sortie = mesurer(v);
      cache.put(cle, JSON.stringify(sortie), CACHE_SECONDES);
    }

    // Le pont part à chaque appel, sortie en cache ou pas : le rythme de
    // l'appelant cadence les événements.
    return json(sortieAvecPontIFTTT(sortie, v.ifttt));
  } catch (err) {
    return json({ erreur: String(err && err.message || err) });
  }
}

/* -------------------------------------------------------------- phrase
   La sortie dite en une phrase — le corps des notifications ntfy. */

/** La sortie de la sonde, dite en une phrase. */
function phraseSortie(s) {
  const nom = s.point && s.point.libelle ? s.point.libelle + ' — ' : '';
  const ou = nom + (s.surface.inclinaison_deg > 0
    ? 'Sur le mur orienté ' + s.surface.orientation_cardinal
      + ' (' + s.surface.orientation_deg + '°)'
    : 'Sur le lieu, à plat');
  let phrase = ou + ' : ' + s.etat + ', score ' + s.score + ' sur 100. ';
  phrase += s.soleil_direct
    ? 'Le soleil frappe la face. '
    : 'Pas de soleil direct sur la face. ';
  const e = s.ensoleillement_jour;
  if (e && e.pourcentage !== null) {
    phrase += 'Aujourd’hui, la face reçoit le soleil direct ' + e.pourcentage
      + ' % du jour (' + e.duree_soleil_h + ' h sur ' + e.duree_jour_h + ' h de jour).';
  }
  return phrase;
}

/**
 * Sondes programmées : à brancher sur un déclencheur horaire Apps Script.
 *
 * Une sonde (propriétés LAT, LON, ORIENTATION, INCLINAISON) ou plusieurs :
 * une propriété par surface, du plus simple à saisir :
 *
 *   SONDE_facade_no = 49.54, 1.10, 333
 *   SONDE_toit      = 49.54, 1.10, 180, 30
 *   SONDE_terrasse  = 49.54, 1.10
 *
 * (« lat, lon [, orientation [, inclinaison [, albedo]]] », point décimal ;
 *  deux valeurs = à plat, trois = mur vertical orienté. La propriété SONDES
 *  — tableau JSON équivalent — reste acceptée et se cumule.) Sept façades
 * ne coûtent qu'un appel à la source si elles partagent le même point.
 *
 * (orientation seule -> mur vertical, comme partout ; albedo facultatif ;
 *  "evenement" facultatif : Webhook IFTTT propre à cette sonde, à chaque
 *  mesure, au lieu du IFTTT_EVENEMENT global.)
 *
 * Canaux de restitution, tous facultatifs, tous gratuits :
 *   - IFTTT_EVENEMENT + IFTTT_CLE : Webhook à CHAQUE mesure de chaque sonde ;
 *   - IFTTT_EVENEMENT_ETAT (+ IFTTT_CLE) : au changement d'état d'une sonde,
 *     événement nommé par la sonde et l'état (ex. sonde_facade_no_plein_soleil)
 *     — une applet IFTTT gratuite par cas utile, chacune activant sa scène
 *     SmartLife, elle-même visible dans Google Home ;
 *   - NTFY_SUJET : au changement d'état, notification mobile via ntfy.sh —
 *     gratuit, sans compte : installer l'appli ntfy et s'abonner au sujet.
 *     Le sujet fait office de secret : en choisir un impossible à deviner.
 *
 * Mémoire d'état par sonde dans ETAT_PRECEDENT[_nom] : pas d'alerte
 * horaire répétitive quand rien ne change.
 */
function listeDesSondes(prop) {
  const sondes = [];

  // Une propriété par sonde : SONDE_<nom> = « lat, lon [, orientation
  // [, inclinaison [, albedo]]] » — nombres à point décimal. Deux valeurs :
  // à plat ; trois : mur vertical orienté ; quatre : inclinaison ; cinq :
  // albédo. Le format le plus sûr à saisir dans l'interface des propriétés.
  const toutes = prop.getProperties();
  for (const cle of Object.keys(toutes).sort()) {
    if (!cle.startsWith('SONDE_')) continue;
    const champs = String(toutes[cle]).split(',').map((v) => v.trim());
    const orientation = champs[2] !== undefined && champs[2] !== '' ? champs[2] : undefined;
    sondes.push({
      nom: cle.slice('SONDE_'.length),
      lat: champs[0],
      lon: champs[1],
      orientation,
      inclinaison: champs[3] !== undefined && champs[3] !== ''
        ? champs[3]
        : (orientation !== undefined ? '90' : undefined),
      albedo: champs[4] !== undefined && champs[4] !== '' ? champs[4] : undefined,
      evenement: null,
    });
  }

  // La propriété SONDES (tableau JSON) reste acceptée, et se cumule.
  const brut = prop.getProperty('SONDES');
  if (brut) {
    const tableau = JSON.parse(brut);
    if (!Array.isArray(tableau) || tableau.length === 0) {
      throw new Error('SONDES doit être un tableau JSON non vide.');
    }
    for (const [i, s] of tableau.entries()) {
      sondes.push({
        nom: s.nom ?? 'sonde' + (i + 1),
        lat: s.lat,
        lon: s.lon,
        orientation: s.orientation ?? undefined,
        inclinaison: s.inclinaison ?? (s.orientation !== undefined ? '90' : undefined),
        albedo: s.albedo ?? undefined,
        evenement: s.evenement ?? null,
      });
    }
  }
  if (sondes.length > 0) return sondes;

  // Mode historique : la sonde unique LAT / LON / ORIENTATION.
  return [{
    nom: null,
    lat: prop.getProperty('LAT'),
    lon: prop.getProperty('LON'),
    orientation: prop.getProperty('ORIENTATION') ?? undefined,
    inclinaison: prop.getProperty('INCLINAISON')
      ?? (prop.getProperty('ORIENTATION') ? '90' : undefined),
    evenement: null,
  }];
}

function sondeProgrammee() {
  const prop = PropertiesService.getScriptProperties();
  const cle = prop.getProperty('IFTTT_CLE');
  const evenementMesure = prop.getProperty('IFTTT_EVENEMENT');
  const baseEtat = prop.getProperty('IFTTT_EVENEMENT_ETAT');
  const sujetNtfy = prop.getProperty('NTFY_SUJET');
  const sondes = listeDesSondes(prop);

  const sorties = [];
  for (const s of sondes) {
    const lecture = lireParametres({
      lat: s.lat, lon: s.lon,
      orientation: s.orientation, inclinaison: s.inclinaison, albedo: s.albedo,
    });
    if (lecture.erreur) throw new Error((s.nom ? s.nom + ' : ' : '') + lecture.erreur);

    const sortie = mesurer(lecture.valeurs);
    sortie.point.libelle = s.nom; // le nom de la sonde voyage dans la sortie

    const evenement = s.evenement ?? evenementMesure;
    if (evenement && cle) declencherIFTTT(evenement, cle, sortie);

    const cleEtat = 'ETAT_PRECEDENT' + (s.nom ? '_' + s.nom : '');
    const precedent = prop.getProperty(cleEtat);
    prop.setProperty(cleEtat, sortie.etat);

    if (sortie.etat !== precedent) {
      // Événement nommé par la sonde et l'état : le nom porte le tri,
      // aucune applet IFTTT n'a besoin du filter code payant.
      if (baseEtat && cle) {
        declencherIFTTT(
          baseEtat + (s.nom ? '_' + s.nom : '') + '_' + sortie.etat.replace(/ /g, '_'),
          cle, sortie,
        );
      }
      if (sujetNtfy) {
        // L'en-tête Title doit rester en ASCII ; les accents vont dans le corps.
        const titre = ('SunProbe ' + (s.nom ? s.nom + ' ' : '') + ': ' + sortie.etat)
          .replace(/[^\x20-\x7e]/g, '-');
        UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(sujetNtfy), {
          method: 'post',
          payload: phraseSortie(sortie),
          headers: { Title: titre },
        });
      }
    }

    sorties.push(sortie);
  }

  // Configuration nommée (SONDES ou SONDE_<nom>) -> tableau ;
  // sonde unique historique -> objet nu, comme avant.
  return sondes.length === 1 && sondes[0].nom === null ? sorties[0] : sorties;
}
