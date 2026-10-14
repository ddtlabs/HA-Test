# Temperature Bars Card

Home-Assistant-Dashboard-Karte, die die Raumtemperaturen als Balken mit Farbverlauf anzeigt (Optik angelehnt an die Wettervorhersage-Karte).

- Skala standardmäßig **15–25 °C**
- Farbverlauf: unter 19 °C blau, **19–21 °C grün**, darüber rot, mit fließenden Übergängen
- Ein Punkt markiert die aktuelle Temperatur, der Wert steht links neben dem Balken
- Pro Raum eine **priorisierte Sensorliste**: der erste Sensor mit gültigem Wert wird angezeigt (z. B. Zigbee zuerst, Homematic als Fallback)
- Klick auf eine Zeile öffnet die Detailansicht des verwendeten Sensors
- Vollständig über den **visuellen Editor** konfigurierbar, nichts ist vorbelegt

## Installation über HACS

1. HACS → Menü (drei Punkte) → **Benutzerdefinierte Repositories**
2. Repository-URL eintragen, Typ **Dashboard** (früher „Lovelace") wählen
3. „Temperature Bars Card" herunterladen, Browser-Cache neu laden (Strg+F5)

Die Ressource wird von HACS automatisch eingetragen. Manuell wäre es `/hacsfiles/<repo-name>/temperature-bars-card.js` als Typ *JavaScript-Modul*.

## Einrichtung

1. Dashboard bearbeiten → Karte hinzufügen → **Temperature Bars Card**
2. Mit **+ Raum hinzufügen** einen Raum anlegen und den HA-Bereich auswählen. Der Anzeigename ist optional, sonst wird der Bereichsname verwendet.
3. Mit **+ Sensor** Sensoren auswählen. Angeboten werden standardmäßig nur die Temperatursensoren des gewählten Bereichs. Über die Checkbox lassen sich alle Temperatursensoren anzeigen.
4. **Sensoren des Bereichs übernehmen** fügt alle Temperatursensoren des Bereichs auf einmal hinzu, Homematic-Sensoren landen dabei zuletzt. Die Reihenfolge lässt sich mit ▲ ▼ anpassen.

## YAML-Beispiel

```yaml
type: custom:temperature-bars-card
title: Temperaturen
min: 15
max: 25
green_from: 19
green_to: 21
decimals: 1
colors:          # optional
  low: "#3b82f6"
  ok: "#4ade80"
  high: "#ef4444"
rooms:
  - area: wohnzimmer        # HA-Bereichs-ID, optional
    name: Wohnzimmer        # optional, sonst Bereichsname
    sensors:                # Priorität von oben nach unten
      - sensor.wohnzimmer_zigbee_temperature
      - sensor.wohnzimmer_heizung_temperature
```

## Optionen

| Option | Standard | Beschreibung |
| --- | --- | --- |
| `title` | – | Kartentitel |
| `min` / `max` | 15 / 25 | Skala des Balkens in °C |
| `green_from` / `green_to` | 19 / 21 | Grüner Komfortbereich |
| `decimals` | 1 | Nachkommastellen |
| `colors.low/ok/high` | blau/grün/rot | Farben des Verlaufs |
| `rooms[].sensors` | – | Sensorliste in Prioritätsreihenfolge |
| `rooms[].area` | – | HA-Bereich, filtert die Sensorauswahl im Editor |
| `rooms[].name` | Bereichsname | Anzeigename |

Ein Raum ohne gültigen Sensorwert (alle `unavailable`/`unknown`) wird abgedunkelt mit „–" angezeigt.
