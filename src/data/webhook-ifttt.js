/**
 * Pont vers les Webhooks IFTTT (maker.ifttt.com).
 *
 * IFTTT ne lit pas la réponse d'une « web request » sortante : le sens utile
 * est donc sonde → IFTTT. Une fois la mesure faite, la page déclenche
 * l'événement en passant les trois champs pilotes en value1/2/3 ; l'applet
 * IFTTT (« Webhooks — Receive a web request ») fait le reste.
 *
 * L'appel part en no-cors : la réponse est opaque, on sait que la demande
 * est partie, pas qu'elle a été acceptée. La clé IFTTT est un secret —
 * une URL qui la porte ne doit pas être publiée.
 */

const RACINE_IFTTT = 'https://maker.ifttt.com/trigger';

/**
 * Construit l'URL de déclenchement. Pure, donc testable hors ligne.
 * @param {string} evenement Nom de l'événement de l'applet.
 * @param {string} cle       Clé Webhooks du compte IFTTT.
 * @param {Record<string, string|number|boolean|null|undefined>} [valeurs]
 *        Champs value1/value2/value3 attendus par IFTTT.
 */
export function urlIFTTT(evenement, cle, valeurs = {}) {
  const u = new URL(
    `${RACINE_IFTTT}/${encodeURIComponent(evenement)}/with/key/${encodeURIComponent(cle)}`,
  );
  for (const [nom, valeur] of Object.entries(valeurs)) {
    if (valeur !== undefined && valeur !== null) u.searchParams.set(nom, String(valeur));
  }
  return u.toString();
}

/** Déclenche l'événement. Lève en cas d'échec réseau, silencieux sinon. */
export async function declencherIFTTT(evenement, cle, valeurs) {
  // no-cors seulement dans un navigateur : maker.ifttt.com ne renvoie pas
  // d'en-têtes CORS et une réponse opaque suffit. Node et Workers n'ont pas
  // cette contrainte et n'implémentent pas tous ce mode.
  const options = typeof window === 'undefined' ? undefined : { mode: 'no-cors' };
  await fetch(urlIFTTT(evenement, cle, valeurs), options);
}

/**
 * Applique le pont à une sortie de sonde : déclenche l'événement avec les
 * trois champs pilotes en value1/2/3, puis rend la sortie augmentée du
 * compte rendu `webhook_ifttt`. Sans configuration, la sortie est rendue
 * telle quelle. « Envoyée » ne veut pas dire « acceptée » : IFTTT ne
 * confirme rien d'exploitable.
 */
export async function sortieAvecPontIFTTT(sortie, ifttt) {
  if (!ifttt) return sortie;
  let envoyee = true;
  try {
    await declencherIFTTT(ifttt.evenement, ifttt.cle, {
      value1: sortie.score,
      value2: sortie.etat,
      value3: String(sortie.soleil_direct),
    });
  } catch {
    envoyee = false;
  }
  return { ...sortie, webhook_ifttt: { evenement: ifttt.evenement, demande_envoyee: envoyee } };
}
