/**
 * SunProbe — enveloppe Cloudflare Workers (assets statiques + API).
 *
 * Le tableau de bord Cloudflare crée volontiers un « Worker » plutôt qu'un
 * projet Pages. Cette enveloppe rend ce chemin praticable : la page est
 * servie comme fichiers statiques (liaison ASSETS, voir wrangler.toml) et
 * la route d'API réutilise **la même fonction** que Cloudflare Pages —
 * aucune logique dupliquée, seulement une adaptation de signature.
 *
 * Les requêtes qui correspondent à un fichier (index.html, src/…) ne
 * passent jamais par ce script : Cloudflare sert l'asset directement.
 */

import { onRequestGet } from './functions/api/v1/ensoleillement.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/v1/ensoleillement') {
      return onRequestGet({ request, env, waitUntil: (p) => ctx.waitUntil(p) });
    }

    // Tout le reste revient aux fichiers statiques (404 compris).
    return env.ASSETS.fetch(request);
  },
};
