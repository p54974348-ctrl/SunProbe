/**
 * Position du soleil — calcul local, aucune dépendance, aucun réseau.
 *
 * Algorithme NOAA / Astronomical Almanac « basse précision » :
 * erreur < 0.02° sur la période 1950-2050, largement suffisant ici.
 * Source de référence : NOAA Solar Calculator.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

const borner = (v, min, max) => Math.min(max, Math.max(min, v));
const mod360 = (v) => ((v % 360) + 360) % 360;

/**
 * Réfraction atmosphérique approchée (Sæmundsson), en degrés.
 * Elle relève le soleil apparent près de l'horizon d'environ 0.57°.
 */
function refraction(hauteurVraieDeg) {
  if (hauteurVraieDeg < -1) return 0;
  const t = hauteurVraieDeg + 10.3 / (hauteurVraieDeg + 5.11);
  return 1.02 / Math.tan(t * DEG) / 60; // arcminutes -> degrés
}

/**
 * @param {Date} instant  Instant absolu (UTC en interne, peu importe le fuseau du Date).
 * @param {number} latitude   Degrés décimaux, positif vers le nord.
 * @param {number} longitude  Degrés décimaux, positif vers l'est.
 * @returns {{hauteur:number, hauteurVraie:number, azimut:number,
 *            declinaison:number, equationDuTemps:number}}
 *          hauteur : élévation apparente au-dessus de l'horizon (degrés)
 *          azimut  : depuis le nord, sens horaire (0 = N, 90 = E, 180 = S, 270 = O)
 */
export function positionSolaire(instant, latitude, longitude) {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  if (!Number.isFinite(ms)) throw new TypeError('positionSolaire : instant invalide');

  // Jours juliens écoulés depuis J2000.0
  const n = ms / 86400000 + 2440587.5 - 2451545.0;

  const longitudeMoyenne = mod360(280.46 + 0.9856474 * n);
  const anomalieMoyenne = mod360(357.528 + 0.9856003 * n);

  // Longitude écliptique apparente
  const lambda =
    longitudeMoyenne +
    1.915 * Math.sin(anomalieMoyenne * DEG) +
    0.02 * Math.sin(2 * anomalieMoyenne * DEG);

  const obliquite = 23.439 - 0.0000004 * n;

  const declinaison =
    Math.asin(borner(Math.sin(obliquite * DEG) * Math.sin(lambda * DEG), -1, 1)) * RAD;

  // Équation du temps, en minutes
  const ascensionDroite =
    Math.atan2(Math.cos(obliquite * DEG) * Math.sin(lambda * DEG), Math.cos(lambda * DEG)) * RAD;
  let ecart = longitudeMoyenne - ascensionDroite;
  ecart = mod360(ecart + 180) - 180;
  const equationDuTemps = ecart * 4;

  // Angle horaire : 0° au midi solaire vrai, négatif le matin
  const d = new Date(ms);
  const heuresUtc = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const tempsSolaireVrai = (heuresUtc * 60 + equationDuTemps + 4 * longitude + 1440) % 1440;
  const angleHoraire = tempsSolaireVrai / 4 - 180;

  const sinHauteur =
    Math.sin(latitude * DEG) * Math.sin(declinaison * DEG) +
    Math.cos(latitude * DEG) * Math.cos(declinaison * DEG) * Math.cos(angleHoraire * DEG);
  const hauteurVraie = Math.asin(borner(sinHauteur, -1, 1)) * RAD;

  const cosAzimut =
    (Math.sin(declinaison * DEG) - Math.sin(hauteurVraie * DEG) * Math.sin(latitude * DEG)) /
    (Math.cos(hauteurVraie * DEG) * Math.cos(latitude * DEG));
  let azimut = Math.acos(borner(cosAzimut, -1, 1)) * RAD;
  if (angleHoraire > 0) azimut = 360 - azimut; // après-midi : le soleil est à l'ouest

  return {
    hauteur: hauteurVraie + refraction(hauteurVraie),
    hauteurVraie,
    azimut: mod360(azimut),
    declinaison,
    equationDuTemps,
  };
}

/** Point cardinal lisible à partir d'un azimut en degrés. */
export function cardinal(azimutDeg) {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                  'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
  return points[Math.round(mod360(azimutDeg) / 22.5) % 16];
}
