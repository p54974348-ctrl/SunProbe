/**
 * SunProbe — configuration centrale.
 * Tout ce qui est réglable vit ici. Aucun autre fichier ne code un seuil en dur.
 */

export const CONFIG = {
  api: {
    irradiance: 'https://api.open-meteo.com/v1/forecast',
    geocodage: 'https://geocoding-api.open-meteo.com/v1/search',
    timeoutMs: 8000,
    tentatives: 2,
    // Fenêtre maximale acceptée par Open-Meteo (API gratuite).
    passeMaxJours: 92,
    futurMaxJours: 16,
  },

  score: {
    /**
     * GHI (W/m²) correspondant à un score de 100.
     * 900 W/m² ≈ midi solaire, ciel dégagé, latitude moyenne, en été.
     * Baisser cette valeur rend le score plus sensible (utile en hiver
     * ou aux hautes latitudes) ; l'augmenter le rend plus sévère.
     */
    ghiPleineEchelle: 900,

    seuils: {
      pleinSoleil: 60, // score >= 60
      soleilFaible: 20, // score >= 20
    },

    /**
     * Hauteur solaire (degrés) sous laquelle on déclare la nuit.
     * -0.833° = disque solaire tangent à l'horizon, réfraction incluse.
     */
    hauteurNuitDeg: -0.833,
  },

  /**
   * Ensoleillement journalier — part du jour où la face reçoit le soleil direct.
   */
  ensoleillement: {
    /**
     * Seuil d'éclairement direct normal (DNI, W/m²) à partir duquel on parle
     * d'ensoleillement. 120 W/m² est la convention de l'OMM : en dessous,
     * le soleil ne dessine plus d'ombre nette.
     */
    seuilDirectWm2: 120,
  },

  /**
   * Surface visée par défaut. Ces valeurs s'appliquent quand la requête
   * ne précise rien, et reproduisent alors le comportement d'origine.
   */
  surface: {
    /** 0 = horizontal (regarde le ciel), 90 = vertical (mur, fenêtre). */
    inclinaisonDeg: 0,
    /** Azimut de la normale : 0 = N, 90 = E, 180 = S, 270 = O. Ignoré si inclinaison = 0. */
    orientationDeg: 180,
    /** Réflectivité du sol devant la surface. 0.2 herbe ou bitume, 0.6 neige fraîche. */
    albedo: 0.2,
  },

  carte: {
    centreDefaut: [46.6, 2.4], // France métropolitaine
    zoomDefaut: 5,
    zoomPoint: 13,
    tuiles: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  },
};
