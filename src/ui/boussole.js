/**
 * Boussole — vue de dessus.
 *
 * Une orientation saisie de travers ne se voit pas dans un nombre. Elle se voit
 * ici : le secteur cyan est ce que la surface « regarde », le point ambre est
 * le soleil. S'ils ne se recouvrent pas, la façade est à l'ombre, et c'est
 * vérifiable sans lire une seule valeur.
 */

const T = 190; // côté du cadran
const H = T + 16; // hauteur totale : le libellé a sa bande sous le cadran, hors des cardinaux
const C = T / 2;
const R = 74; // rayon du cadran

const DEG = Math.PI / 180;

/** Azimut (0 = nord, sens horaire) -> coordonnées écran. */
const pt = (azimutDeg, rayon) => [
  C + rayon * Math.sin(azimutDeg * DEG),
  C - rayon * Math.cos(azimutDeg * DEG),
];

const f = (n) => n.toFixed(1);

/**
 * @param {object} p
 * @param {number} p.azimutSoleilDeg
 * @param {number} p.hauteurSoleilDeg
 * @param {number} p.orientationDeg   Azimut de la normale à la surface.
 * @param {number} p.inclinaisonDeg   0 = horizontal : la surface n'a pas d'orientation.
 * @param {boolean} p.soleilDirect
 */
export function dessinerBoussole({
  azimutSoleilDeg,
  hauteurSoleilDeg,
  orientationDeg,
  inclinaisonDeg,
  soleilDirect,
}) {
  const horizontal = inclinaisonDeg === 0;
  const nuit = hauteurSoleilDeg <= -0.833;
  // Le soleil couché ne frappe aucune face, quoi qu'en dise l'appelant.
  const direct = soleilDirect && !nuit;

  // Champ de vue : un plan vertical voit un demi-espace (±90° autour de sa normale).
  // Plus il se couche vers l'horizontale, plus il voit large, jusqu'à tout le ciel.
  const demiAngle = horizontal ? 180 : 90 + (90 - inclinaisonDeg) / 2;
  const [ax, ay] = pt(orientationDeg - demiAngle, R);
  const [bx, by] = pt(orientationDeg + demiAngle, R);
  const grandArc = demiAngle * 2 > 180 ? 1 : 0;

  const secteur = horizontal
    ? `<circle cx="${C}" cy="${C}" r="${R}" fill="var(--zenith)" opacity="0.1"/>`
    : `<path d="M${C} ${C} L${f(ax)} ${f(ay)} A${R} ${R} 0 ${grandArc} 1 ${f(bx)} ${f(by)} Z"
             fill="var(--zenith)" opacity="0.13"/>`;

  const [nx, ny] = pt(orientationDeg, R - 8);
  const normale = horizontal
    ? ''
    : `<line x1="${C}" y1="${C}" x2="${f(nx)}" y2="${f(ny)}"
             stroke="var(--zenith)" stroke-width="2"/>
       <circle cx="${f(nx)}" cy="${f(ny)}" r="3.5" fill="var(--zenith)"/>`;

  const [sx, sy] = pt(azimutSoleilDeg, R - 8);
  const soleil = nuit
    ? ''
    : `<line x1="${C}" y1="${C}" x2="${f(sx)}" y2="${f(sy)}" stroke="var(--flux)"
             stroke-width="1.4" stroke-dasharray="3 3" opacity="0.75"/>
       <circle cx="${f(sx)}" cy="${f(sy)}" r="6.5" fill="var(--flux)"
               stroke="var(--nuit)" stroke-width="2"/>`;

  const cardinaux = [
    ['N', 0], ['E', 90], ['S', 180], ['O', 270],
  ]
    .map(([lettre, az]) => {
      const [x, y] = pt(az, R + 14);
      return `<text x="${f(x)}" y="${f(y + 4)}" text-anchor="middle" font-size="11"
                font-family="var(--data)" fill="var(--brume)">${lettre}</text>`;
    })
    .join('');

  const graduations = Array.from({ length: 24 }, (_, i) => {
    const az = i * 15;
    const [x1, y1] = pt(az, R);
    const [x2, y2] = pt(az, az % 90 === 0 ? R - 9 : R - 4);
    return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"
              stroke="var(--trait)" stroke-width="1"/>`;
  }).join('');

  const etiquette = nuit
    ? 'Soleil sous l\u2019horizon'
    : horizontal
      ? 'Surface horizontale'
      : direct
        ? 'Soleil sur la face'
        : 'Soleil derrière la face';

  const resume = `Vue de dessus. ${etiquette}.` +
    (horizontal ? '' : ` Surface orientée à ${Math.round(orientationDeg)} degrés.`) +
    (nuit ? '' : ` Soleil à ${Math.round(azimutSoleilDeg)} degrés.`);

  return `
<svg class="boussole" viewBox="0 0 ${T} ${H}" preserveAspectRatio="xMidYMid meet"
     role="img" aria-label="${resume}">
  <circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="var(--trait)" stroke-width="1"/>
  ${graduations}
  ${secteur}
  ${normale}
  ${soleil}
  <circle cx="${C}" cy="${C}" r="2.5" fill="var(--brume)"/>
  ${cardinaux}
  <text x="${C}" y="${H - 4}" text-anchor="middle" font-size="10" font-family="var(--data)"
        letter-spacing="0.08em" fill="${direct ? 'var(--flux)' : 'var(--brume)'}"
        >${etiquette.toUpperCase()}</text>
</svg>`;
}
