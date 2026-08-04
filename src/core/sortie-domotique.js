/**
 * Sortie domotique — contrat stable, versionné.
 *
 * C'est le seul format que consomment Home Assistant, Jeedom, Node-RED, etc.
 * Règle : on n'enlève jamais un champ et on ne change jamais le sens d'un champ
 * existant sans incrémenter `version`. Ajouter un champ reste rétrocompatible.
 *
 * `score` porte toujours sur la surface décrite par le bloc `surface`.
 * Sans inclinaison demandée, cette surface est le plan horizontal : un client
 * qui ignore l'orientation reçoit donc exactement ce qu'il recevait avant.
 */

import { cardinal } from './solar-position.js';

export const VERSION_SORTIE = 1;

const arrondi = (v, d = 0) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/**
 * @param {object} p
 * @param {{latitude:number, longitude:number, libelle?:string, altitude?:number}} p.point
 * @param {Date}   p.instant       Instant absolu évalué.
 * @param {string} [p.instantLocal] Horodatage local au point, ex. "2026-07-25T14:00".
 * @param {string} [p.fuseau]      Ex. "Europe/Paris".
 * @param {object} p.evaluation    Retour de evaluer().
 * @param {object} p.mesures       { ghi, dni, dhi, nuages } sur plan horizontal.
 * @param {object} p.geometrie     Retour de positionSolaire().
 * @param {object} [p.ensoleillement] Retour de ensoleillementJournalier().
 * @param {string} [p.source]
 * @param {'ok'|'approchee'|'indisponible'} [p.fraicheur]
 */
export function construireSortie({
  point,
  instant,
  instantLocal = null,
  fuseau = null,
  evaluation,
  mesures = {},
  geometrie,
  ensoleillement = null,
  source = 'open-meteo',
  fraicheur = 'ok',
}) {
  const s = evaluation.surface;

  return {
    version: VERSION_SORTIE,
    horodatage_utc: instant.toISOString(),
    horodatage_local: instantLocal,
    fuseau,

    point: {
      latitude: arrondi(point.latitude, 5),
      longitude: arrondi(point.longitude, 5),
      altitude_m: arrondi(point.altitude, 0),
      libelle: point.libelle ?? null,
    },

    /** La surface effectivement évaluée. Horizontale par défaut. */
    surface: {
      inclinaison_deg: arrondi(s.inclinaisonDeg, 1),
      orientation_deg: arrondi(s.orientationDeg, 1),
      orientation_cardinal: s.inclinaisonDeg > 0 ? cardinal(s.orientationDeg) : null,
      albedo: s.albedo,
    },

    // --- Les trois champs que consomme un scénario domotique ---
    etat: evaluation.etat, // "plein soleil" | "soleil faible" | "ombre" | "nuit"
    score: evaluation.score, // 0-100, sur la surface décrite ci-dessus
    soleil_direct: evaluation.soleilDirect, // le faisceau touche-t-il la face ?

    /**
     * Part du jour local pendant laquelle la face reçoit le soleil direct
     * (DNI au moins au seuil OMM et soleil devant la face). Champ ajouté,
     * rétrocompatible. `pourcentage` vaut null en nuit polaire : sans jour,
     * un pourcentage du jour n'a pas de sens.
     */
    ensoleillement_jour: {
      pourcentage: ensoleillement?.pourcentage ?? null,
      duree_soleil_h: ensoleillement?.dureeSoleilH ?? null,
      duree_jour_h: ensoleillement?.dureeJourH ?? null,
    },

    mesures: {
      /** Grandeur qui porte le score : irradiance reçue par la surface. */
      irradiance_surface_w_m2: evaluation.irradianceSurface,
      surface_direct_w_m2: evaluation.composantesSurface.direct,
      surface_diffus_w_m2: evaluation.composantesSurface.diffus,
      surface_sol_w_m2: evaluation.composantesSurface.sol,

      /** Données brutes de la source, sur plan horizontal. */
      ghi_w_m2: arrondi(mesures.ghi, 0),
      dni_w_m2: arrondi(mesures.dni, 0),
      dhi_w_m2: arrondi(mesures.dhi, 0),
      couverture_nuageuse_pct: arrondi(mesures.nuages, 0),
      composantes_estimees: evaluation.composantesEstimees,
    },

    geometrie: {
      hauteur_deg: arrondi(geometrie.hauteur, 2),
      azimut_deg: arrondi(geometrie.azimut, 2),
      azimut_cardinal: cardinal(geometrie.azimut),
      /** Angle entre le rayon solaire et la normale à la surface. >90° = soleil derrière. */
      angle_incidence_deg: evaluation.angleIncidenceDeg,
      ghi_ciel_clair_w_m2: evaluation.ghiCielClair,
      indice_ciel_clair: evaluation.indiceCielClair,
    },

    source,
    fraicheur, // "ok" = donnée à l'heure demandée ; "approchee" = heure voisine
  };
}
