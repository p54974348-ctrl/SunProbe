# Intégration domotique

Le scénario domotique interroge le service en lui décrivant **une surface** — sa position et son orientation — et reçoit en retour un pourcentage d'ensoleillement pour cette surface précise.

Trois champs pilotent, le reste diagnostique.

| Champ | Type | Usage |
|---|---|---|
| `score` | entier 0–100 | Ensoleillement de la surface décrite. Seuils et rampes progressives. |
| `etat` | `plein soleil` \| `soleil faible` \| `ombre` \| `nuit` | Conditions lisibles dans un scénario. |
| `soleil_direct` | booléen | Le faisceau touche-t-il cette face ? Faux dès que le soleil passe derrière. |

Le champ `version` vaut `1`. Il change si le sens d'un champ existant change — jamais pour un simple ajout.

## Décrire la surface

| Paramètre | Défaut | Sens |
|---|---|---|
| `lat`, `lon` | requis | Position, en degrés décimaux. |
| `inclinaison` | `0` | 0 = horizontal (sol, toit plat). 90 = vertical (mur, fenêtre). |
| `orientation` | `180` | Azimut de la surface depuis le nord : 0 = N, 90 = E, 180 = S, 270 = O. Sans effet si l'inclinaison vaut 0. |
| `albedo` | `0.2` | Réflectivité du sol devant la surface. 0.6 pour de la neige fraîche. |
| `at` | maintenant | `AAAA-MM-JJTHH:MM`, en heure locale du point. |

```bash
# Le sol, à plat
curl 'http://IP:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993'

# Une baie vitrée plein sud
curl 'http://IP:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993&inclinaison=90&orientation=180'

# Un panneau en toiture, pente 30°, exposé sud-ouest
curl 'http://IP:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993&inclinaison=30&orientation=225'
```

Sans `inclinaison`, la surface est horizontale et la réponse est identique à celle d'avant : un scénario existant n'a rien à changer.

**Trouver son orientation** : dans une application de cartographie, tracez la perpendiculaire sortante de la façade et lisez son cap. Une fenêtre qui donne au sud-ouest est à 225°. En cas de doute, la boussole de la page web montre le secteur vu par la surface et la position du soleil : si le point ambre est hors du secteur cyan, l'orientation est fausse ou la façade est bien à l'ombre.

---

## Lancer le service

```bash
node server/sunprobe-api.mjs
```

Variables d'environnement : `PORT` (8787), `HOST` (0.0.0.0), `CACHE_MS` (300000).

Le cache mémoire évite de solliciter Open-Meteo à chaque interrogation. Une sonde qui interroge toutes les minutes ne déclenche qu'un appel réseau toutes les cinq minutes.

```bash
curl 'http://localhost:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993'
curl 'http://localhost:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993&at=2026-07-25T14:00'
```

`at` est facultatif ; sans lui, l'instant courant est pris **dans le fuseau du point**, pas celui du serveur. Format `AAAA-MM-JJTHH:MM`.

### En service systemd

```ini
# /etc/systemd/system/sunprobe.service
[Unit]
Description=SunProbe API
After=network-online.target

[Service]
Type=simple
User=sunprobe
WorkingDirectory=/opt/sunprobe
ExecStart=/usr/bin/node server/sunprobe-api.mjs
Environment=PORT=8787
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## Home Assistant

### Un capteur par façade

C'est le montage qui rend la sonde utile : une ressource REST par orientation, chacune décrivant une vraie surface de la maison.

```yaml
# configuration.yaml
rest:
  # --- Baie vitrée du salon, plein sud ---
  - resource: >-
      http://192.168.1.20:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993&inclinaison=90&orientation=180
    scan_interval: 300
    timeout: 15
    sensor:
      - name: Soleil facade sud
        unique_id: sunprobe_sud
        value_template: "{{ value_json.score }}"
        unit_of_measurement: "%"
        state_class: measurement
        icon: mdi:white-balance-sunny
        availability: "{{ value_json.score is defined }}"
        json_attributes:
          - etat
          - soleil_direct
    binary_sensor:
      - name: Soleil direct facade sud
        unique_id: sunprobe_sud_direct
        value_template: "{{ value_json.soleil_direct }}"
        device_class: light
        availability: "{{ value_json.soleil_direct is defined }}"

  # --- Bureau, façade ouest ---
  - resource: >-
      http://192.168.1.20:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993&inclinaison=90&orientation=270
    scan_interval: 300
    sensor:
      - name: Soleil facade ouest
        unique_id: sunprobe_ouest
        value_template: "{{ value_json.score }}"
        unit_of_measurement: "%"
        availability: "{{ value_json.score is defined }}"
    binary_sensor:
      - name: Soleil direct facade ouest
        unique_id: sunprobe_ouest_direct
        value_template: "{{ value_json.soleil_direct }}"
        device_class: light
```

`availability` est important : sans lui, une panne réseau fait retomber le capteur à `unknown`, et un scénario mal écrit interprète cela comme « pas de soleil » et ouvre les volets en pleine canicule.

Home Assistant expose déjà `sun.sun` pour la hauteur et l'azimut du soleil ; inutile de créer un capteur pour cela.

`availability` est important : sans lui, une panne réseau fait retomber le capteur à `unknown`, et un scénario mal écrit interprète cela comme « pas de soleil » et ouvre les volets en pleine canicule.

### Automatisation — chaque façade à son heure

```yaml
automation:
  - alias: Fermer les volets sud quand le soleil frappe
    trigger:
      - platform: numeric_state
        entity_id: sensor.soleil_facade_sud
        above: 60
        for: "00:10:00"
    condition:
      # Le score seul ne suffit pas : par ciel très lumineux, une façade
      # peut être bien notée sans que le soleil la touche. Ce test-là
      # distingue « il fait clair » de « le soleil tape sur la vitre ».
      - condition: state
        entity_id: binary_sensor.soleil_direct_facade_sud
        state: "on"
      - condition: numeric_state
        entity_id: sensor.temperature_salon
        above: 24
    action:
      - service: cover.set_cover_position
        target: { entity_id: cover.volets_sud }
        data: { position: 30 }
```

Le `for: 10 minutes` évite qu'un trou de nuage fasse claquer les volets toutes les deux minutes.

C'est là tout l'intérêt d'une sonde orientée : la façade est se protège le matin, la façade ouest en fin d'après-midi, et la façade nord jamais. Un seul capteur horizontal ne saurait pas faire la différence — il déclencherait les trois en même temps.

### Position proportionnelle

```yaml
      - service: cover.set_cover_position
        target: { entity_id: cover.volets_sud }
        data:
          position: >
            {{ [100 - (states('sensor.soleil_facade_sud') | int(0)), 20] | max }}
```

Score 0 → volets ouverts ; score 80 → 20 % ; jamais en dessous de 20 %, pour garder du jour.

### Rouvrir quand le soleil est passé

```yaml
  - alias: Rouvrir les volets sud quand le soleil a tourné
    trigger:
      - platform: state
        entity_id: binary_sensor.soleil_direct_facade_sud
        to: "off"
        for: "00:15:00"
    action:
      - service: cover.open_cover
        target: { entity_id: cover.volets_sud }
```

---

## Jeedom

Plugin **Script** ou **JSON API**, commande de type *info*, avec la requête sur `http://IP:8787/api/v1/ensoleillement?lat=…&lon=…` et les chemins d'extraction `score`, `etat`, `mesures.ghi_w_m2`.

En passant par un script shell :

```bash
#!/bin/sh
curl -s --max-time 15 \
  "http://127.0.0.1:8787/api/v1/ensoleillement?lat=49.4431&lon=1.0993" \
  | jq -r '.score'
```

---

## Node-RED

```
[inject toutes les 5 min] → [http request GET] → [json] → [switch sur msg.payload.etat] → …
```

Pour une fonction de décision :

```javascript
const s = msg.payload;
if (s.etat === 'nuit')                       { msg.action = 'ouvrir'; }
else if (!s.soleil_direct)                   { msg.action = 'ouvrir'; }
else if (s.score >= 65)                      { msg.action = 'fermer'; }
else if (s.score < 30)                       { msg.action = 'ouvrir'; }
else                                         { msg.action = 'inchange'; }
return msg;
```

L'écart entre 65 et 30 est une hystérésis délibérée : sans elle, un score qui oscille autour d'un seuil unique fait osciller les volets avec lui.

---

## Sans le service Node

Pour un montage minimal, un automatisme peut appeler Open-Meteo directement et refaire le seuillage lui-même. On perd le calcul de hauteur solaire et l'indice de ciel clair, mais on garde le GHI :

```yaml
rest:
  - resource: >-
      https://api.open-meteo.com/v1/forecast?latitude=49.4431&longitude=1.0993&current=shortwave_radiation,cloud_cover&timezone=auto
    scan_interval: 900
    sensor:
      - name: GHI brut
        value_template: "{{ value_json.current.shortwave_radiation }}"
        unit_of_measurement: "W/m²"
```

Home Assistant expose déjà `sun.sun` avec `elevation` et `azimuth`, ce qui couvre la partie géométrique.

---

## Conseils de terrain

- **Ne pas interroger plus souvent que toutes les cinq minutes.** La donnée est horaire : au-delà, on sollicite un service gratuit pour rien.
- **Toujours temporiser les déclencheurs** (`for:` en Home Assistant). Le GHI change vite au passage d'un nuage ; un moteur de volet, lui, s'use.
- **Prévoir le cas indisponible.** Tester `availability`, et choisir explicitement le comportement de repli.
- **Le score ne connaît pas votre relief.** La sonde sait que le soleil est géométriquement en face de votre fenêtre, pas qu'un immeuble se trouve entre les deux. Si un bâtiment vous masque le soleil couchant, ajoutez une condition sur `geometrie.azimut_deg` et `geometrie.hauteur_deg` pour décrire votre horizon à la main :

  ```yaml
  # Le hangar voisin masque tout ce qui est à l'ouest sous 12° de hauteur
  - condition: template
    value_template: >
      {{ not (state_attr('sensor.soleil_facade_ouest','azimut_deg') | float(0) > 250
              and state_attr('sensor.soleil_facade_ouest','hauteur_deg') | float(0) < 12) }}
  ```

- **Un débord de toit ou un brise-soleil n'est pas modélisé** non plus. En été, ils coupent une grande partie du direct sur une fenêtre sud, et rien en hiver. Si votre façade en a un, le score la surestimera aux heures hautes.

---

## SmartLife (Tuya) et Google Home

Ni SmartLife ni Google Home ne savent appeler une API : ils savent en revanche **exécuter des scènes**. La sonde s'y raccorde donc par IFTTT, en trois pièces — et sans abonnement, grâce aux événements **nommés par l'état**.

### 1. Côté SmartLife : des scènes « Tap-to-Run »

Dans l'application Smart Life : **Scénario** → **Tap-to-Run** (« exécuter au toucher »), une scène par situation, par exemple :

- `Façade au soleil` — descendre le volet à mi-course, éteindre le chauffage d'appoint…
- `Façade à l'ombre` — remonter le volet.

### 2. Côté sonde : les événements nommés par l'état

Dans les propriétés du script Apps Script, ajouter `IFTTT_EVENEMENT_ETAT` (par exemple `sonde`). **Au changement d'état seulement**, la sonde déclenche alors l'événement correspondant : `sonde_plein_soleil`, `sonde_soleil_faible`, `sonde_ombre`, `sonde_nuit` — avec score, état et soleil direct en value1/2/3. Avec plusieurs sondes (propriété `SONDES`), le nom s'intercale : `sonde_facade_no_plein_soleil`.

### 3. Côté IFTTT : une applet gratuite par état utile

Le compte IFTTT gratuit offre 2 applets — assez pour le couple qui compte :

- **Si** Webhooks « Receive a web request », événement `sonde_plein_soleil` → **Alors** Smart Life « Activate scene » : `Façade au soleil`.
- **Si** événement `sonde_ombre` → **Alors** Smart Life : `Façade à l'ombre`.

C'est le nom de l'événement qui porte l'état : aucun tri à faire côté IFTTT, donc pas besoin du « filter code » payant.

### Et Google Home ?

Liez SmartLife à Google Home (application Google Home → Ajouter → Fonctionne avec Google → Smart Life) : les appareils et les scènes Tuya y apparaissent. Vous y **voyez** l'effet de la sonde (volets, prises…) et pouvez dire « OK Google, active Façade au soleil » pour rejouer une scène à la voix.

Deux limites honnêtes. Google Home ne sait pas *prononcer* une réponse personnalisée de la sonde : Google a fermé ce canal (Conversational Actions) en 2023 — pour une réponse parlée ou affichée, les chemins restent la notification ntfy/e-mail, la page web, ou l'agent Dialogflow en texte. Et il n'y a pas de « capteur virtuel » gratuit et pérenne côté Tuya : l'état de la sonde se matérialise par ses effets (scènes), pas par une tuile de mesure — pour une vraie tuile capteur, c'est Home Assistant (section ci-dessus).
