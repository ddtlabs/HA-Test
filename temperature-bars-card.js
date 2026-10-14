/**
 * temperature-bars-card
 *
 * Raumtemperaturen als Balken mit Farbverlauf (blau -> gruen -> rot).
 * Pro Raum eine priorisierte Sensorliste: der erste Sensor mit gueltigem
 * Wert wird angezeigt, die uebrigen dienen als Fallback.
 * Konfiguration komplett ueber den visuellen Editor moeglich.
 */

const CARD_VERSION = "0.1.0";

const DEFAULTS = {
  min: 15,
  max: 25,
  green_from: 19,
  green_to: 21,
  decimals: 1,
  colors: {
    low: "#3b82f6",
    ok: "#4ade80",
    high: "#ef4444",
  },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function num(v, fallback) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalize(config) {
  const c = {
    ...config,
    min: num(config.min, DEFAULTS.min),
    max: num(config.max, DEFAULTS.max),
    green_from: num(config.green_from, DEFAULTS.green_from),
    green_to: num(config.green_to, DEFAULTS.green_to),
    decimals: clamp(Math.round(num(config.decimals, DEFAULTS.decimals)), 0, 3),
    colors: { ...DEFAULTS.colors, ...(config.colors || {}) },
    rooms: Array.isArray(config.rooms) ? config.rooms : [],
  };
  if (c.max <= c.min) {
    c.min = DEFAULTS.min;
    c.max = DEFAULTS.max;
  }
  if (c.green_to < c.green_from) {
    [c.green_from, c.green_to] = [c.green_to, c.green_from];
  }
  return c;
}

function gradientCss(c) {
  const p = (v) => clamp(((v - c.min) / (c.max - c.min)) * 100, 0, 100).toFixed(2);
  return (
    `linear-gradient(90deg, ${c.colors.low} 0%, ` +
    `${c.colors.ok} ${p(c.green_from)}%, ${c.colors.ok} ${p(c.green_to)}%, ` +
    `${c.colors.high} 100%)`
  );
}

/** Erster Sensor der Liste mit numerischem Wert (Prioritaetsreihenfolge). */
function resolveRoom(hass, room) {
  const sensors = (room.sensors || []).filter(Boolean);
  for (const id of sensors) {
    const st = hass.states[id];
    if (!st) continue;
    const v = parseFloat(st.state);
    if (Number.isFinite(v)) {
      return {
        value: v,
        entity: id,
        unit: st.attributes.unit_of_measurement || "°C",
        fallback: id !== sensors[0],
      };
    }
  }
  return null;
}

function roomName(hass, room) {
  return room.name || (room.area && hass.areas && hass.areas[room.area] && hass.areas[room.area].name) || "Raum";
}

/** Temperatursensoren eines HA-Bereichs (direkt oder ueber das Geraet zugeordnet). */
function areaTempSensors(hass, areaId) {
  if (!areaId) return [];
  return Object.keys(hass.states).filter((id) => {
    if (!id.startsWith("sensor.")) return false;
    if (hass.states[id].attributes.device_class !== "temperature") return false;
    const ent = hass.entities && hass.entities[id];
    const dev = ent && ent.device_id && hass.devices ? hass.devices[ent.device_id] : null;
    return ((ent && ent.area_id) || (dev && dev.area_id)) === areaId;
  });
}

/** Heuristik fuer die Vorschlagsreihenfolge: Homematic zuletzt. */
function isHomematic(hass, id) {
  const ent = hass.entities && hass.entities[id];
  return !!(ent && ent.platform && /homematic|hmip|ccu/i.test(ent.platform)) || /homematic|hmip/i.test(id);
}

/* ------------------------------------------------------------------ */
/* Karte                                                               */
/* ------------------------------------------------------------------ */

class TemperatureBarsCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._sig = null;
  }

  static getConfigElement() {
    return document.createElement("temperature-bars-card-editor");
  }

  static getStubConfig() {
    return { title: "Temperaturen", rooms: [] };
  }

  setConfig(config) {
    if (!config) throw new Error("Ungueltige Konfiguration");
    if (config.rooms !== undefined && !Array.isArray(config.rooms)) {
      throw new Error("'rooms' muss eine Liste sein");
    }
    this._config = normalize(config);
    this._sig = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 1 + (this._config ? this._config.rooms.length : 0);
  }

  _render() {
    if (!this._config || !this._hass) return;
    const c = this._config;
    const hass = this._hass;

    const rows = c.rooms.map((room) => {
      const r = resolveRoom(hass, room);
      return {
        name: roomName(hass, room),
        r,
        entity: r ? r.entity : (room.sensors || []).filter(Boolean)[0],
      };
    });

    const sig = JSON.stringify(rows.map((x) => [x.name, x.r && x.r.value, x.r && x.r.entity]));
    if (sig === this._sig) return;
    this._sig = sig;

    const lang = hass.locale && hass.locale.language;
    const fmt = (v) =>
      v.toLocaleString(lang, { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
    const grad = gradientCss(c);

    const rowHtml = rows
      .map((x, i) => {
        if (!x.r) {
          return `<div class="row off" data-i="${i}">
            <div class="name">${esc(x.name)}</div>
            <div class="val">–</div>
            <div class="bar"><div class="track" style="background:${grad}"></div></div>
          </div>`;
        }
        const f = clamp((x.r.value - c.min) / (c.max - c.min), 0, 1);
        const title = `${x.r.entity}${x.r.fallback ? " (Fallback-Sensor)" : ""}`;
        return `<div class="row" data-i="${i}" title="${esc(title)}">
          <div class="name">${esc(x.name)}</div>
          <div class="val">${fmt(x.r.value)}${esc(x.r.unit)}</div>
          <div class="bar">
            <div class="track" style="background:${grad}"></div>
            <div class="dot" style="left:calc(7px + (100% - 14px) * ${f.toFixed(4)})"></div>
          </div>
        </div>`;
      })
      .join("");

    const empty = rows.length
      ? ""
      : `<div class="hint">Noch keine Räume konfiguriert. Räume und Sensoren im Karten-Editor hinzufügen.</div>`;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .rows { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 12px; }
        .title { padding: 16px 16px 8px; font-size: var(--ha-card-header-font-size, 24px); line-height: 1.2; color: var(--ha-card-header-color, var(--primary-text-color)); }
        .row { display: grid; grid-template-columns: minmax(64px, 28%) 56px 1fr; align-items: center; gap: 12px; cursor: pointer; }
        .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--primary-text-color); }
        .val { text-align: right; color: var(--secondary-text-color); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .bar { position: relative; height: 18px; }
        .track { position: absolute; left: 0; right: 0; top: 50%; height: 10px; transform: translateY(-50%); border-radius: 5px; }
        .dot { position: absolute; top: 50%; width: 14px; height: 14px; box-sizing: border-box; transform: translate(-50%, -50%); border-radius: 50%; background: #d6dadc; border: 2px solid #3a3f44; box-shadow: 0 0 2px rgba(0,0,0,.4); }
        .off .track { opacity: .25; }
        .off .name, .off .val { opacity: .6; }
        .scale { display: grid; grid-template-columns: minmax(64px, 28%) 56px 1fr; gap: 12px; margin-top: -4px; font-size: 11px; color: var(--secondary-text-color); }
        .scale div:last-child { display: flex; justify-content: space-between; }
        .hint { padding: 16px; color: var(--secondary-text-color); }
      </style>
      <ha-card>
        ${c.title ? `<div class="title">${esc(c.title)}</div>` : ""}
        ${empty}
        ${rows.length ? `<div class="rows">${rowHtml}
          <div class="scale"><div></div><div></div><div><span>${esc(fmt(c.min))}°</span><span>${esc(fmt(c.max))}°</span></div></div>
        </div>` : ""}
      </ha-card>`;

    this.shadowRoot.querySelectorAll(".row").forEach((el) => {
      el.addEventListener("click", () => {
        const x = rows[Number(el.dataset.i)];
        if (!x || !x.entity) return;
        this.dispatchEvent(
          new CustomEvent("hass-more-info", { detail: { entityId: x.entity }, bubbles: true, composed: true })
        );
      });
    });
  }
}

/* ------------------------------------------------------------------ */
/* Visueller Editor                                                    */
/* ------------------------------------------------------------------ */

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k.startsWith(".")) el[k.slice(1)] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

const LABELS = {
  title: "Titel",
  min: "Skala von (°C)",
  max: "Skala bis (°C)",
  green_from: "Grün ab (°C)",
  green_to: "Grün bis (°C)",
  area: "Bereich",
  name: "Anzeigename (optional)",
  entity: "Temperatursensor",
};

/** Laedt die HA-Editor-Elemente (ha-form, Pickers), falls noch nicht registriert. */
async function ensureEditorElements() {
  if (customElements.get("ha-form") && customElements.get("ha-selector") && customElements.get("ha-entity-picker")) return;
  try {
    const helpers = await window.loadCardHelpers();
    const card = await helpers.createCardElement({ type: "entities", entities: [] });
    if (card && card.constructor && card.constructor.getConfigElement) await card.constructor.getConfigElement();
  } catch (e) {
    /* Elemente sind meist ohnehin schon geladen */
  }
}

class TemperatureBarsCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._showAll = new Set(); // Raum-Indizes mit "alle Sensoren anzeigen"
    this._lastEmitted = null;
  }

  setConfig(config) {
    if (this._lastEmitted !== null && JSON.stringify(config) === this._lastEmitted) return;
    this._cfg = {
      ...config,
      rooms: (config.rooms || []).map((r) => ({ ...r, sensors: [...(r.sensors || [])] })),
    };
    this._ready = ensureEditorElements().then(() => this._render());
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll("ha-form").forEach((f) => (f.hass = hass));
    if (this._cfg && !this._rendered) this._render();
  }

  _emit() {
    const rooms = this._cfg.rooms.map((r) => {
      const o = { ...r, sensors: (r.sensors || []).filter(Boolean) };
      if (!o.name) delete o.name;
      if (!o.area) delete o.area;
      return o;
    });
    const cfg = { ...this._cfg, rooms };
    for (const k of ["title", "min", "max", "green_from", "green_to"]) {
      if (cfg[k] === undefined || cfg[k] === null || cfg[k] === "") delete cfg[k];
    }
    this._lastEmitted = JSON.stringify(cfg);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
  }

  _change(fn, rerender = true) {
    fn();
    this._emit();
    if (rerender) this._render();
  }

  _form(schema, data, onChange) {
    return h("ha-form", {
      ".hass": this._hass,
      ".schema": schema,
      ".data": data,
      ".computeLabel": (s) => LABELS[s.name] || s.name,
      onchange: (e) => e.stopPropagation(),
      "onvalue-changed": (ev) => {
        ev.stopPropagation();
        onChange(ev.detail.value);
      },
    });
  }

  _render() {
    if (!this._cfg || !this._hass) return;
    this._rendered = true;
    const cfg = this._cfg;
    const root = this.shadowRoot;
    root.innerHTML = "";

    root.append(
      h("style", {
        text: `
        :host { display: block; }
        .section { margin-bottom: 20px; }
        h3 { margin: 16px 0 8px; font-size: 16px; font-weight: 500; color: var(--primary-text-color); }
        .room { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; margin-bottom: 12px; }
        .roomhead, .sensor { display: flex; align-items: center; gap: 4px; }
        .roomhead ha-form { flex: 1; }
        .sensor ha-form { flex: 1; }
        .sensors-title { margin: 8px 0 4px; font-size: 13px; color: var(--secondary-text-color); }
        .btns { display: flex; gap: 2px; flex-shrink: 0; }
        button { cursor: pointer; border: 1px solid var(--divider-color); background: var(--card-background-color, #fff); color: var(--primary-text-color); border-radius: 8px; padding: 6px 10px; font: inherit; }
        button:hover { background: var(--secondary-background-color); }
        button[disabled] { opacity: .3; cursor: default; }
        button.small { padding: 4px 8px; }
        button.danger { color: var(--error-color, #db4437); }
        .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; align-items: center; }
        label.check { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--secondary-text-color); }
        .note { font-size: 12px; color: var(--secondary-text-color); margin-top: 4px; }
      `,
      })
    );

    // Allgemein
    const general = {
      title: cfg.title || "",
      min: num(cfg.min, DEFAULTS.min),
      max: num(cfg.max, DEFAULTS.max),
      green_from: num(cfg.green_from, DEFAULTS.green_from),
      green_to: num(cfg.green_to, DEFAULTS.green_to),
    };
    const num_sel = { number: { mode: "box", step: 0.5 } };
    root.append(
      h(
        "div",
        { class: "section" },
        this._form(
          [
            { name: "title", selector: { text: {} } },
            {
              type: "grid",
              name: "",
              schema: [
                { name: "min", selector: num_sel },
                { name: "max", selector: num_sel },
                { name: "green_from", selector: num_sel },
                { name: "green_to", selector: num_sel },
              ],
            },
          ],
          general,
          (v) => this._change(() => Object.assign(this._cfg, v), false)
        )
      )
    );

    // Raeume
    root.append(h("h3", { text: "Räume" }));
    const n = cfg.rooms.length;
    cfg.rooms.forEach((room, i) => root.append(this._renderRoom(room, i, n)));
    root.append(
      h("button", {
        text: "+ Raum hinzufügen",
        onclick: () => this._change(() => cfg.rooms.push({ area: "", name: "", sensors: [] })),
      })
    );
    root.append(
      h("div", {
        class: "note",
        text: "Pro Raum zählt die Reihenfolge der Sensoren: Der erste Sensor mit gültigem Wert wird angezeigt, die weiteren sind Fallback.",
      })
    );
  }

  _renderRoom(room, i, n) {
    const cfg = this._cfg;
    const hass = this._hass;
    const box = h("div", { class: "room" });

    const swap = (arr, a, b) => ([arr[a], arr[b]] = [arr[b], arr[a]]);
    const moveBtns = (arr, idx, onRemove) =>
      h(
        "div",
        { class: "btns" },
        h("button", { class: "small", text: "▲", title: "Nach oben", ".disabled": idx === 0, onclick: () => this._change(() => swap(arr, idx, idx - 1)) }),
        h("button", { class: "small", text: "▼", title: "Nach unten", ".disabled": idx === arr.length - 1, onclick: () => this._change(() => swap(arr, idx, idx + 1)) }),
        h("button", { class: "small danger", text: "✕", title: "Entfernen", onclick: () => this._change(onRemove) })
      );

    // Kopf: Bereich + Name
    box.append(
      h(
        "div",
        { class: "roomhead" },
        this._form(
          [
            { name: "area", selector: { area: {} } },
            { name: "name", selector: { text: {} } },
          ],
          { area: room.area || "", name: room.name || "" },
          (v) => {
            const areaChanged = (v.area || "") !== (room.area || "");
            this._change(() => {
              room.area = v.area || "";
              room.name = v.name || "";
            }, areaChanged);
          }
        ),
        moveBtns(cfg.rooms, i, () => {
          cfg.rooms.splice(i, 1);
          this._showAll.clear();
        })
      )
    );

    // Sensoren
    box.append(h("div", { class: "sensors-title", text: "Sensoren (Priorität von oben nach unten)" }));
    const areaIds = areaTempSensors(hass, room.area);
    const restrict = room.area && areaIds.length > 0 && !this._showAll.has(i);
    const filter = { domain: "sensor", device_class: "temperature" };
    const entitySel = restrict ? { entity: { filter, include_entities: areaIds } } : { entity: { filter } };

    room.sensors.forEach((id, j) => {
      box.append(
        h(
          "div",
          { class: "sensor" },
          this._form([{ name: "entity", selector: entitySel }], { entity: id }, (v) =>
            this._change(() => (room.sensors[j] = v.entity || ""), false)
          ),
          moveBtns(room.sensors, j, () => room.sensors.splice(j, 1))
        )
      );
    });

    const actions = h("div", { class: "actions" });
    actions.append(h("button", { text: "+ Sensor", onclick: () => this._change(() => room.sensors.push("")) }));
    if (room.area) {
      actions.append(
        h("button", {
          text: "Sensoren des Bereichs übernehmen",
          title: "Fügt alle Temperatursensoren des Bereichs hinzu, Homematic zuletzt",
          onclick: () =>
            this._change(() => {
              const suggested = [...areaIds].sort(
                (a, b) => Number(isHomematic(hass, a)) - Number(isHomematic(hass, b)) || a.localeCompare(b)
              );
              const have = new Set(room.sensors);
              room.sensors = [...room.sensors.filter(Boolean), ...suggested.filter((id) => !have.has(id))];
            }),
        })
      );
      actions.append(
        h(
          "label",
          { class: "check" },
          h("input", {
            type: "checkbox",
            ".checked": this._showAll.has(i),
            onchange: (e) => {
              if (e.target.checked) this._showAll.add(i);
              else this._showAll.delete(i);
              this._render();
            },
          }),
          "Alle Temperatursensoren anzeigen"
        )
      );
    }
    box.append(actions);
    if (room.area && areaIds.length === 0) {
      box.append(h("div", { class: "note", text: "In diesem Bereich wurden keine Temperatursensoren gefunden, es werden alle angeboten." }));
    }
    return box;
  }
}

customElements.define("temperature-bars-card", TemperatureBarsCard);
customElements.define("temperature-bars-card-editor", TemperatureBarsCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "temperature-bars-card",
  name: "Temperature Bars Card",
  description: "Raumtemperaturen als Balken mit Farbverlauf, mit priorisierten Sensoren pro Raum.",
  preview: false,
});

console.info(`%c TEMPERATURE-BARS-CARD %c ${CARD_VERSION} `, "color:white;background:#3b82f6;font-weight:700", "color:#3b82f6;background:white");
