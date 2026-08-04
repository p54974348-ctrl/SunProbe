/**
 * Référence « ciel clair » — calcul local, aucune dépendance.
 *
 * Sert d'étalon : combien de lumière ce point recevrait-il, à cet instant,
 * si le ciel était parfaitement dégagé ? Comparé au GHI réellement prévu,
 * cela isole la part imputable aux nuages.
 *
 * Modèle de Haurwitz (1946) : GHI = 1098 · cos(z) · exp(-0.059 / cos(z))
 * Empirique, sans paramètre d'entrée autre que la hauteur du soleil.
 * Précision typique ±10 % — suffisant pour un indicateur, insuffisant
 * pour du dimensionnement photovoltaïque (voir docs/CALCUL.md).
 */

const DEG = Math.PI / 180;

/**
 * @param {number} hauteurDeg  Hauteur du soleil au-dessus de l'horizon, en degrés.
 * @returns {number} Irradiance globale horizontale par ciel clair, en W/m². 0 si nuit.
 */
export function ghiCielClair(hauteurDeg) {
  const cosZenith = Math.sin(hauteurDeg * DEG);
  if (cosZenith <= 0) return 0;
  return 1098 * cosZenith * Math.exp(-0.059 / cosZenith);
}

/**
 * Indice de ciel clair : rapport entre le flux réel et le flux théorique maximal.
 * 1.0 = ciel dégagé. 0.3 = couvert. Peut légèrement dépasser 1 lors des
 * effets de bord de nuage (surirradiance), d'où le plafond à 1.15.
 *
 * @returns {number|null} null si le soleil est sous l'horizon (rapport non défini).
 */
export function indiceCielClair(ghiMesure, ghiClair) {
  if (!Number.isFinite(ghiMesure) || !Number.isFinite(ghiClair) || ghiClair < 5) return null;
  return Math.min(1.15, Math.max(0, ghiMesure / ghiClair));
}
