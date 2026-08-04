#!/usr/bin/env node
/**
 * Garde-fou d'architecture : vérifie que les couches restent étanches.
 * Les règles sont celles de CLAUDE.md. Ce script les rend exécutables,
 * pour qu'une session future ne puisse pas les enfreindre sans le savoir.
 */
import { readFileSync, readdirSync } from 'node:fs';

const lire = (dossier) =>
  readdirSync(new URL(dossier, import.meta.url))
    .filter((f) => f.endsWith('.js'))
    .map((f) => [`${dossier}${f}`, readFileSync(new URL(`${dossier}${f}`, import.meta.url), 'utf8')]);

const regles = [
  ['../src/core/', /\bfetch\s*\(|\bdocument\.|\bwindow\.|from ['"]node:/,
   'le noyau doit rester pur : ni réseau, ni DOM, ni module Node'],
  ['../src/data/', /\bdocument\.|\bwindow\.|from ['"]node:/,
   'la couche données ne touche ni au DOM ni aux modules Node'],
  ['../src/ui/', /\bfetch\s*\(/,
   'la couche affichage ne fait pas de réseau'],
];

let fautes = 0;
for (const [dossier, motif, message] of regles) {
  for (const [chemin, contenu] of lire(dossier)) {
    const sansCommentaires = contenu.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (motif.test(sansCommentaires)) {
      console.log(`ECHEC  ${chemin.replace('../','')} — ${message}`);
      fautes++;
    }
  }
}

// Les seuils ne vivent que dans config.js.
const score = readFileSync(new URL('../src/core/score.js', import.meta.url), 'utf8');
if (/\b(60|20|900)\b\s*[;,)]/.test(score.replace(/\/\*[\s\S]*?\*\//g, ''))) {
  console.log('ECHEC  src/core/score.js — seuil codé en dur, il doit venir de src/config.js');
  fautes++;
}

console.log(fautes === 0
  ? 'PASS  étanchéité des couches respectée'
  : `\n${fautes} infraction(s) aux règles d'architecture de CLAUDE.md`);
process.exit(fautes === 0 ? 0 : 1);
