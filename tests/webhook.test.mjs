/**
 * Pont IFTTT : construction de l'URL de declenchement.
 * urlIFTTT est pure — aucun appel reseau ici.
 */
import { urlIFTTT } from '../src/data/webhook-ifttt.js';

const ok = (n, c, i = '') => { console.log(`${c ? 'PASS' : 'ECHEC'}  ${n} ${i}`); if (!c) process.exitCode = 1; };

const u = new URL(urlIFTTT('soleil_facade', 'CLE123', { value1: 58, value2: 'soleil faible', value3: 'true' }));
ok('URL sur maker.ifttt.com', u.origin === 'https://maker.ifttt.com');
ok('evenement et cle dans le chemin', u.pathname === '/trigger/soleil_facade/with/key/CLE123');
ok('les trois valeurs passent en query',
   u.searchParams.get('value1') === '58'
   && u.searchParams.get('value2') === 'soleil faible'
   && u.searchParams.get('value3') === 'true');

const encode = new URL(urlIFTTT('évènement/été', 'clé à espaces'));
ok('evenement et cle sont encodes', !encode.pathname.includes(' ')
   && encode.pathname.includes('%C3%A9v%C3%A8nement%2F%C3%A9t%C3%A9'));

const creux = new URL(urlIFTTT('e', 'k', { value1: 0, value2: null, value3: undefined }));
ok('zero passe, null et undefined sont ignores',
   creux.searchParams.get('value1') === '0'
   && !creux.searchParams.has('value2') && !creux.searchParams.has('value3'));
