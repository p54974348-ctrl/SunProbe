/**
 * Ensoleillement journalier : part du jour ou une surface orientee recoit
 * le soleil direct. Verifie sur des journees synthetiques dont le DNI est
 * controle, aux quatre coins du globe et de l'annee.
 */
import { ensoleillementJournalier } from '../src/core/ensoleillement.js';
import { CONFIG } from '../src/config.js';

const ok = (n, c, i = '') => { console.log(`${c ? 'PASS' : 'ECHEC'}  ${n} ${i}`); if (!c) process.exitCode = 1; };

/** Journee synthetique : 24 pas horaires estampilles en heure locale du point. */
const journee = (date, decalageUtcH, dni) =>
  Array.from({ length: 24 }, (_, h) => ({
    instant: new Date(Date.parse(`${date}T${String(h).padStart(2, '0')}:00:00Z`) - decalageUtcH * 3600000),
    dni: typeof dni === 'function' ? dni(h) : dni,
  }));

const ROUEN = { latitude: 49.4431, longitude: 1.0993 };
const TROMSO = { latitude: 69.6489, longitude: 18.9551 };

/* --- Plan horizontal : le pourcentage suit le seuil, pas la geometrie --- */

const eteClair = ensoleillementJournalier({ serieJour: journee('2026-06-15', 2, 600), ...ROUEN });
ok('ete clair, horizontal -> 100 % du jour', eteClair.pourcentage === 100, `-> ${eteClair.pourcentage} %`);
ok('duree de jour plausible en juin a Rouen (15-17 h)',
   eteClair.dureeJourH >= 15 && eteClair.dureeJourH <= 17, `-> ${eteClair.dureeJourH} h`);

const couvert = ensoleillementJournalier({ serieJour: journee('2026-06-15', 2, 0), ...ROUEN });
ok('ciel couvert (DNI nul) -> 0 %, le jour reste compte',
   couvert.pourcentage === 0 && couvert.dureeJourH === eteClair.dureeJourH);

const sousSeuil = ensoleillementJournalier({
  serieJour: journee('2026-06-15', 2, CONFIG.ensoleillement.seuilDirectWm2 - 1), ...ROUEN,
});
const auSeuil = ensoleillementJournalier({
  serieJour: journee('2026-06-15', 2, CONFIG.ensoleillement.seuilDirectWm2), ...ROUEN,
});
ok('le seuil vient de la config : juste dessous -> 0 %, juste dessus -> 100 %',
   sousSeuil.pourcentage === 0 && auSeuil.pourcentage === 100);

/* --- Surfaces orientees : la geometrie filtre le direct --- */

const surMurSud = ensoleillementJournalier({
  serieJour: journee('2026-06-15', 2, 600), ...ROUEN,
  surface: { inclinaisonDeg: 90, orientationDeg: 180 },
});
const surMurNord = ensoleillementJournalier({
  serieJour: journee('2026-06-15', 2, 600), ...ROUEN,
  surface: { inclinaisonDeg: 90, orientationDeg: 0 },
});
ok('mur sud plus ensoleille que mur nord en ete',
   surMurSud.pourcentage > surMurNord.pourcentage,
   `-> S ${surMurSud.pourcentage} % / N ${surMurNord.pourcentage} %`);
ok('en ete, le mur nord recoit tout de meme les extremites de journee',
   surMurNord.pourcentage > 0, `-> ${surMurNord.pourcentage} %`);

const nordHiver = ensoleillementJournalier({
  serieJour: journee('2026-12-15', 1, 600), ...ROUEN,
  surface: { inclinaisonDeg: 90, orientationDeg: 0 },
});
ok('mur nord en hiver -> 0 %, le soleil ne passe jamais devant', nordHiver.pourcentage === 0);

// Mur nord-ouest : n'est frappe qu'en fin de journee, quand le soleil passe a l'ouest.
const noEte = ensoleillementJournalier({
  serieJour: journee('2026-06-15', 2, 600), ...ROUEN,
  surface: { inclinaisonDeg: 90, orientationDeg: 333 },
});
const noHiver = ensoleillementJournalier({
  serieJour: journee('2026-12-15', 1, 600), ...ROUEN,
  surface: { inclinaisonDeg: 90, orientationDeg: 333 },
});
ok('mur nord-ouest : ensoleille en partie l\'ete, entre le mur sud et le mur nord',
   noEte.pourcentage > 0 && noEte.pourcentage < surMurSud.pourcentage,
   `-> ${noEte.pourcentage} %`);
ok('mur nord-ouest : moins servi en hiver qu\'en ete',
   (noHiver.pourcentage ?? 0) < noEte.pourcentage,
   `-> hiver ${noHiver.pourcentage} % / ete ${noEte.pourcentage} %`);

ok('les heures ensoleillees ne depassent jamais les heures de jour',
   [eteClair, surMurSud, surMurNord, nordHiver].every((r) => r.dureeSoleilH <= r.dureeJourH));

/* --- Latitudes polaires : les deux cas limites du calendrier --- */

const nuitPolaire = ensoleillementJournalier({ serieJour: journee('2026-12-15', 1, 600), ...TROMSO });
ok('nuit polaire -> pourcentage null, pas 0 : il n\'y a pas de jour',
   nuitPolaire.pourcentage === null && nuitPolaire.dureeJourH === 0);

const soleilDeMinuit = ensoleillementJournalier({ serieJour: journee('2026-06-21', 2, 600), ...TROMSO });
ok('soleil de minuit -> 24 h de jour et 100 %',
   soleilDeMinuit.dureeJourH === 24 && soleilDeMinuit.pourcentage === 100);

/* --- Robustesse --- */

const vide = ensoleillementJournalier({ serieJour: [], ...ROUEN });
ok('serie vide -> null, sans exception', vide.pourcentage === null && vide.dureeJourH === 0);

const dniManquant = ensoleillementJournalier({ serieJour: journee('2026-06-15', 2, null), ...ROUEN });
ok('DNI manquant (null) traite comme nul -> 0 %', dniManquant.pourcentage === 0);
