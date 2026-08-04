/**
 * Accès réseau — la seule couche autorisée à faire des fetch.
 * Tout échec réseau est traduit en ErreurReseau, avec un message affichable tel quel.
 */

import { CONFIG } from '../config.js';

export class ErreurReseau extends Error {
  /** @param {string} message @param {string} cause 'timeout'|'http'|'reseau'|'format' */
  constructor(message, cause, statut = null) {
    super(message);
    this.name = 'ErreurReseau';
    this.cause = cause;
    this.statut = statut;
  }
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET JSON avec délai d'attente et réessais sur erreur transitoire.
 * @param {string|URL} url
 */
export async function recupererJson(url, options = {}) {
  const { timeoutMs = CONFIG.api.timeoutMs, tentatives = CONFIG.api.tentatives } = options;
  let derniereErreur;

  for (let essai = 0; essai <= tentatives; essai++) {
    if (essai > 0) await attendre(400 * essai);

    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), timeoutMs);

    try {
      const reponse = await fetch(String(url), {
        signal: controleur.signal,
        headers: { Accept: 'application/json' },
      });

      if (!reponse.ok) {
        // 4xx : la requête est fautive, réessayer ne sert à rien.
        if (reponse.status >= 400 && reponse.status < 500) {
          throw new ErreurReseau(
            `Le service a refusé la requête (HTTP ${reponse.status}).`,
            'http',
            reponse.status,
          );
        }
        throw new ErreurReseau(
          `Le service est indisponible (HTTP ${reponse.status}).`,
          'http',
          reponse.status,
        );
      }

      try {
        return await reponse.json();
      } catch {
        throw new ErreurReseau('La réponse du service est illisible.', 'format');
      }
    } catch (err) {
      derniereErreur =
        err instanceof ErreurReseau
          ? err
          : err?.name === 'AbortError'
            ? new ErreurReseau(`Le service n'a pas répondu en ${timeoutMs / 1000} s.`, 'timeout')
            : new ErreurReseau('Connexion impossible. Vérifiez le réseau.', 'reseau');

      if (derniereErreur.cause === 'http' && derniereErreur.statut < 500) throw derniereErreur;
    } finally {
      clearTimeout(minuteur);
    }
  }

  throw derniereErreur;
}
