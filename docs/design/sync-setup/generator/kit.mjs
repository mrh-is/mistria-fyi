// The app's own pieces, transcribed from src/ for the sync setup canvas: the 512 px column, the
// home header, the welcome card, Data cards, StatusNote, the import drop zone, the transfer QR,
// the sonner toast, dialogs, and the floating toolbar. Every piece reads the palette `C`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TABLER = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "tabler.json"), "utf8"),
);

export const LIGHT = {
  paper: "#f7f5f0",
  raised: "#fdfcf9",
  sunken: "#eeedea",
  ink: "#2e2a22",
  muted: "#6a6460",
  hair: "#948a7c",
  accent: "#8a642e",
  accentFg: "#fdfcf9",
  primary: "#1a7a3a",
  green: "#1a7a3a",
  amber: "#a85a0e",
  blue: "#1860a8",
  red: "#c03030",
  mark: "#a85a0e",
  shadow: "rgb(46 42 34 / 12%)",
  scrim: "rgb(0 0 0 / 50%)",
  dark: false,
  tagPaper: "#e2dace",
  tagInk: "#312e2b",
  tagMuted: "#68635e",
  tagAccent: "#a65343",
  tagHi: "#fff8e9",
  cat: {
    almanac: "#5848c0",
    animals: "#c03838",
    cosmetics: "#9838a8",
    mines: "#7a5a3a",
    museum: "#2e8a30",
    quests: "#1878b8",
    recipes: "#b87028",
    renown: "#a48018",
    skills: "#1a8878",
    villagers: "#c03060",
  },
};
export const DARK = {
  paper: "#222226",
  raised: "#28282c",
  sunken: "#2e2e32",
  ink: "#e4dfd8",
  muted: "#a8a098",
  hair: "#746c64",
  accent: "#a87838",
  accentFg: "#101014",
  primary: "#38984e",
  green: "#38984e",
  amber: "#c88030",
  blue: "#3878b8",
  red: "#e85858",
  mark: "#c88030",
  shadow: "rgb(0 0 0 / 30%)",
  scrim: "rgb(0 0 0 / 60%)",
  dark: true,
  tagPaper: "#352f2a",
  tagInk: "#e8e3dc",
  tagMuted: "#aaa39b",
  tagAccent: "#c36d5a",
  tagHi: "#fff8e9",
  cat: {
    almanac: "#7868d8",
    animals: "#b84040",
    cosmetics: "#b058c0",
    mines: "#9a7848",
    museum: "#38902e",
    quests: "#3890d0",
    recipes: "#b87830",
    renown: "#a88820",
    skills: "#30a090",
    villagers: "#d04878",
  },
};
export let C = LIGHT;
export const setPalette = (p) => {
  C = p;
};

const mix = (color, pct, base) => `color-mix(in srgb, ${color} ${pct}%, ${base ?? "transparent"})`;
export const hairline = (pct = 34) => mix(C.hair, pct);

const BRAND = "font-family:'Instrument Serif',Georgia,serif";
const DISPLAY = `${BRAND};font-style:italic;font-weight:400`;
export const BODY = "font-family:Petrona,Georgia,serif";
const CONTROLS = "font-family:'Fragment Mono','Courier New',monospace";
const ANNOT = "font-family:Satoshi,system-ui,sans-serif";
const DATA = "font-family:'IBM Plex Mono','Courier New',monospace";

export const ti = (name, size = 16, color = "currentColor", extra = "") =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;${extra}">${TABLER[
    name
  ]
    .map(
      ([tag, a]) =>
        `<${tag} ${Object.entries(a)
          .filter(([k]) => k !== "key")
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ")}></${tag}>`,
    )
    .join("")}</svg>`;

// Text
export const eyebrow = (t, color) =>
  `<h2 style="margin:0 0 8px;${CONTROLS};font-size:10px;font-weight:400;letter-spacing:.14em;text-transform:uppercase;color:${color ?? C.muted}">${t}</h2>`;
export const p = (t, size = 14, color, extra = "") =>
  `<p style="margin:0;${BODY};font-size:${size}px;line-height:1.5;color:${color ?? C.ink};${extra}">${t}</p>`;
export const note = (t, size = 12) =>
  `<p style="margin:0;${ANNOT};font-size:${size}px;line-height:1.45;color:${C.muted}">${t}</p>`;
export const code = (t) =>
  `<code style="${DATA};font-size:12px;background:${C.sunken};padding:1px 4px;border-radius:2px">${t}</code>`;
export const b = (t) => `<strong style="font-weight:600">${t}</strong>`;
export const row = (items, gap = 8, extra = "") =>
  `<div style="display:flex;flex-wrap:wrap;gap:${gap}px;align-items:center;${extra}">${items.join("")}</div>`;
export const col = (items, gap = 12, extra = "") =>
  `<div style="display:flex;flex-direction:column;gap:${gap}px;${extra}">${items.join("")}</div>`;

// Buttons: ui/button variants, h-11, radius 2px.
export const btn = (t, { kind = "outline", icon, full = false, size = "default" } = {}) => {
  const k = {
    outline: `background:${C.paper};color:${C.ink};border:1px solid ${hairline(60)};box-shadow:0 1px 2px ${C.shadow}`,
    default: `background:${C.primary};color:${C.paper};border:1px solid ${C.primary};box-shadow:0 1px 2px ${C.shadow}`,
    ghost: `background:transparent;color:${C.ink};border:1px solid transparent`,
    destructive: `background:${C.red};color:#fff;border:1px solid ${C.red}`,
  }[kind];
  const h = size === "sm" ? 36 : 44;
  return `<button type="button" style="display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:${h}px;padding:0 ${size === "sm" ? 12 : 16}px;${full ? "width:100%;" : ""}${k};border-radius:2px;${BODY};font-size:14px;font-weight:500;cursor:pointer">${icon ? ti(icon, 16) : ""}${t}</button>`;
};
export const textLink = (t, extra = "") =>
  `<button type="button" style="background:none;border:0;padding:0;min-height:32px;${BODY};font-size:14px;font-weight:500;color:${C.primary};text-decoration:underline dotted;text-underline-offset:2px;cursor:pointer;${extra}">${t}</button>`;
export const switchLink = (t) =>
  `<button type="button" style="display:flex;align-items:center;gap:5px;width:fit-content;min-height:32px;background:none;border:0;padding:0;${ANNOT};font-size:11px;color:${C.muted};text-decoration:underline dotted;text-decoration-color:${mix("currentColor", 42)};text-underline-offset:3px;cursor:pointer">${t}<span aria-hidden="true">→</span></button>`;

// StatusNote: tinted, radius 2px.
export const status = (tone, inner, extra = "") => {
  const c = { success: C.green, warning: C.amber, error: C.red, info: C.blue }[tone];
  return `<div role="${tone === "success" ? "status" : "alert"}" style="padding:12px;border-radius:2px;background:${mix(c, 10, C.paper)};color:${mix(c, 80, C.ink)};${BODY};font-size:14px;line-height:1.5;display:flex;flex-direction:column;gap:8px;${extra}">${inner}</div>`;
};

// Lowercase roman numerals in the home accent, the canvas's step marks.
export const steps = (list, { size = 22, gap = 12 } = {}) =>
  `<ol style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:${gap}px">${list
    .map(
      ([n, inner, o = {}]) =>
        `<li style="display:flex;gap:10px;align-items:flex-start${o.dim ? ";opacity:.55" : ""}"><span aria-hidden="true" style="flex:none;width:${Math.round(size * 1.1)}px;${DISPLAY};font-size:${size}px;line-height:1;color:${o.done ? C.green : C.accent}">${n}.</span><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;padding-top:2px">${inner}</div></li>`,
    )
    .join("")}</ol>`;

// Photo-mount corners for what you hand over: the code, the save.
export const corners = (s = 12, o = -4, all = false) => {
  const c = C.accent;
  const at = (v, h, bt, side) =>
    `<span aria-hidden="true" style="position:absolute;${v}:${o}px;${h}:${o}px;border-${bt}:${s}px solid ${c};border-${side}:${s}px solid transparent"></span>`;
  return (
    at("top", "left", "top", "right") +
    at("bottom", "right", "bottom", "left") +
    (all ? at("top", "right", "top", "left") + at("bottom", "left", "bottom", "right") : "")
  );
};

// The transfer card's full-bleed QR band, with corners on the code.
export const qrBand = (state, caption) => {
  const box =
    state === "shown"
      ? `<div style="position:relative;width:184px;height:184px;background:#fff;padding:10px;box-sizing:border-box"><div role="img" aria-label="Pairing code" style="display:grid;grid-template-columns:repeat(21,minmax(0,1fr));width:164px;height:164px"><sc-for list="{{cells}}" as="c" hint-placeholder-count="441"><div style="background:{{c.fill}}"></div></sc-for></div>${corners()}</div>`
      : `<div style="position:relative;width:184px;height:184px;background:${C.sunken};display:flex;align-items:center;justify-content:center">${btn("Show code", { icon: "eye" })}${corners()}</div>`;
  return `<div style="margin:0 -14px;padding:16px 0;border-top:1px solid ${hairline(60)};border-bottom:1px solid ${hairline(60)};display:flex;flex-direction:column;align-items:center;gap:10px">${box}${caption ? `<p style="margin:0;padding:0 16px;text-align:center;${BODY};font-size:14px;color:${C.muted}">${caption}</p>` : ""}</div>`;
};

export const matchCode = (digits = "482 913") =>
  `<div style="position:relative;align-self:center;padding:12px 22px;background:${C.sunken}"><span role="img" aria-label="Matching code ${digits.replace(/ /g, "").split("").join(" ")}" style="${DATA};font-size:34px;font-weight:500;letter-spacing:.1em;color:${C.ink}">${digits}</span>${corners(10, -3)}</div>`;

// The import card's drop zone, with corners.
export const dropZone = ({
  label = "Drag your save file here",
  error = false,
  browse = true,
} = {}) =>
  `<div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;padding:22px 16px;text-align:center;border:2px dashed ${error ? C.red : hairline(60)};border-radius:4px">${corners(12, -4, true)}${ti("upload", 24, C.muted)}<p style="margin:0;${BODY};font-size:14px;color:${C.muted}">${label}</p>${browse ? `<p style="margin:0;${BODY};font-size:12px;color:${C.muted}">or</p>${textLink("browse files", "min-height:24px")}` : ""}</div>`;

export const pathCopy = (path = "%LOCALAPPDATA%\\FieldsOfMistria\\saves") =>
  `<div style="display:flex;align-items:center;gap:8px;border:1px solid ${hairline(60)};background:${C.sunken};border-radius:2px;padding:8px 12px"><code style="flex:1;${DATA};font-size:12px;word-break:break-all;color:${C.ink}">${path}</code><button type="button" aria-label="Copy path" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:none;border:0;color:${C.muted}">${ti("copy", 16)}</button></div>`;

export const waiting = (t) =>
  `<div style="display:flex;align-items:center;gap:8px;${BODY};font-size:14px;color:${C.muted}">${ti("loader-2", 16, C.muted)}${t}</div>`;

// DataCard: 3px home-accent rule, dashed divider when open.
export const dataCard = (title, summary, { open = false, body = "", tone } = {}) => {
  const rule = tone === "danger" ? C.red : C.accent;
  return `<div style="border:1px solid ${hairline()};border-left:3px solid ${rule};background:${C.raised};box-shadow:0 1px 1px ${C.shadow}"><button type="button" aria-expanded="${open}" style="display:flex;width:100%;align-items:flex-start;gap:12px;padding:13px 14px;background:none;border:0;text-align:left;color:${C.ink};cursor:pointer"><span style="flex:1;min-width:0;display:flex;flex-direction:column"><span style="${BODY};font-size:16px;font-weight:600;line-height:1;color:${tone === "danger" ? mix(C.red, 80, C.ink) : C.ink}">${title}</span>${open ? "" : `<span style="margin-top:6px;${BODY};font-size:12px;line-height:1.3;color:${C.muted}">${summary}</span>`}</span>${ti("chevron-right", 20, C.muted, `margin-top:2px;${open ? "transform:rotate(90deg)" : ""}`)}</button>${open ? `<div style="padding:8px 14px 16px;border-top:1px dashed ${hairline()};display:flex;flex-direction:column;gap:14px">${body}</div>` : ""}</div>`;
};

// The welcome card: accent rule, faint wash, a tilted marker, mono overline.
export const welcome = ({
  tone,
  icon = "sparkles",
  overline,
  title,
  body = "",
  actions = [],
  foot = "",
  wide = false,
}) => {
  const c = tone ?? C.accent;
  const acts = actions.length
    ? `<div style="position:relative;z-index:1;display:grid;grid-template-columns:${wide || actions.length === 1 ? "minmax(0,1fr)" : "minmax(0,1fr) minmax(0,1fr)"};gap:8px">${actions
        .map(
          ([t, ic, primary]) =>
            `<button type="button" style="display:flex;min-height:44px;align-items:center;justify-content:center;gap:8px;padding:8px 12px;border:1px solid ${c};${CONTROLS};font-size:12px;font-weight:600;line-height:1.2;text-align:center;cursor:pointer;${primary ? `color:${C.accentFg};background:${c}` : `color:${C.ink};background:${mix(C.raised, 92, c)}`}">${ic ? ti(ic, 17) : ""}<span>${t}</span></button>`,
        )
        .join("")}</div>`
    : "";
  return `<section style="position:relative;display:flex;flex-direction:column;gap:14px;padding:19px 18px 16px 21px;overflow:clip;border:1px solid ${hairline(38)};border-left:3px solid ${c};background:${C.raised};box-shadow:0 1px 1px ${C.shadow}"><span aria-hidden="true" style="position:absolute;top:17px;right:17px;display:grid;place-items:center;width:30px;height:30px;color:${c};background:${mix(c, 10, C.raised)};border-radius:50%;transform:rotate(5deg)">${ti(icon, 17)}</span><div style="position:relative;z-index:1;max-width:calc(100% - 40px);display:flex;flex-direction:column;gap:4px"><p style="margin:0 0 0;${CONTROLS};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${c}">${overline}</p><h2 style="margin:0 0 3px;${BRAND};font-size:20px;font-weight:600;line-height:1.15;color:${C.ink}">${title}</h2>${body}</div>${acts}${foot}</section>`;
};

// The tag dialog: a paper shipping tag on a string (tag-dialog.svelte), over paper at 72%.
export const tagDialog = ({ title, desc = "", body = "", actions = [], narrow = false }) =>
  `<div role="dialog" aria-modal="true" style="position:absolute;inset:0;z-index:6;background:${mix(C.paper, 72)};display:flex;align-items:center;justify-content:center;padding:16px"><div style="position:relative;width:100%;max-width:${narrow ? 360 : 430}px;filter:drop-shadow(1px -2px 6px rgb(31 23 15 / 18%)) drop-shadow(3px 8px 16px rgb(31 23 15 / 28%));transform:rotate(-0.35deg)"><svg aria-hidden="true" viewBox="0 0 120 70" style="position:absolute;top:-28px;left:calc(50% - 60px);z-index:3;width:120px;height:70px;overflow:visible;fill:none;stroke:${mix(C.tagInk, 35, "#fff")};stroke-linecap:round;stroke-width:2.2"><path d="M117 3 C89 2 82 27 60 59"></path></svg><div style="display:flex;flex-direction:column;color:${C.tagInk};background:${C.tagPaper};clip-path:polygon(14px 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%,0 14px);-webkit-mask:radial-gradient(circle at 50% 31px,transparent 0 7px,#000 7.5px);mask:radial-gradient(circle at 50% 31px,transparent 0 7px,#000 7.5px)"><div style="display:flex;min-height:62px;align-items:center;justify-content:center;border-bottom:1px dashed ${mix(C.tagInk, 35)}"><span style="width:34px;height:34px;box-sizing:border-box;border:8px solid ${C.tagAccent};border-radius:50%"></span></div><div style="padding:15px 16px 0;display:flex;flex-direction:column;gap:10px"><h2 style="margin:0;${DISPLAY};font-size:24px;line-height:1;color:${C.tagInk}">${title}</h2>${desc ? `<p style="margin:0;${ANNOT};font-size:14px;line-height:1.4;color:${C.tagMuted}">${desc}</p>` : ""}${body}</div><div style="display:flex;gap:8px;padding:14px 16px 16px">${actions
    .map(
      ([t, confirm]) =>
        `<button type="button" style="flex:1;min-height:40px;border:1px solid ${confirm ? C.tagAccent : mix(C.tagInk, 42)};background:${confirm ? C.tagAccent : "transparent"};color:${confirm ? C.tagHi : C.tagInk};${CONTROLS};font-size:10px;cursor:pointer">${t}</button>`,
    )
    .join("")}</div></div></div></div>`;

// “How it works”, a tag dialog opened from the welcome card.
export const howDialog = () => {
  const part = (ic, t, d) =>
    `<li style="display:flex;gap:10px;align-items:flex-start">${ti(ic, 18, C.tagAccent, "margin-top:2px")}<div><p style="margin:0;${BODY};font-size:15px;font-weight:600;color:${C.tagInk}">${t}</p><p style="margin:0;${ANNOT};font-size:13px;line-height:1.4;color:${C.tagMuted}">${d}</p></div></li>`;
  return tagDialog({
    title: "How it works",
    body: `<ol style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px">${part("device-floppy", "The game saves", "Fields of Mistria writes a save on your PC every time you sleep.")}${part("device-desktop", "The relay passes it on", "A tab like this one, open on that PC, spots each new save and sends it to your phone, locked so only your phone can read it.")}${part("device-mobile", "The tracker catches up", "Your phone updates your progress. Anything you check off by hand stays on the device where you checked it off.")}</ol>`,
    actions: [["Got it", true]],
  });
};

// A field note: a taped-in slip with the app’s highlighter band under its title. Amber needs
// you, red is an error, green is good news, and hairline is just so you know.
export const fieldNote = ({
  tone,
  icon = "info-circle",
  title,
  body = "",
  extra = "",
  actions = [],
  tilt = -0.4,
}) => {
  const c = tone ?? C.hair;
  return `<div style="position:relative;display:flex;gap:12px;padding:16px 16px 14px;background:${C.raised};border:1px solid ${hairline(38)};box-shadow:0 2px 6px ${C.shadow};transform:rotate(${tilt}deg)"><span aria-hidden="true" style="position:absolute;top:-8px;left:26px;width:58px;height:16px;background:${mix(c, 24, C.raised)};border:1px solid ${mix(c, 30)};opacity:.9;transform:rotate(-3deg)"></span><span aria-hidden="true" style="flex:none;display:grid;place-items:center;width:28px;height:28px;color:${c};background:${mix(c, 10, C.raised)};border-radius:50%;transform:rotate(5deg)">${ti(icon, 16)}</span><div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:5px"><strong style="position:relative;isolation:isolate;display:block;width:fit-content;${BODY};font-size:15px;font-weight:600;line-height:1.3;color:${C.ink}">${title}<span aria-hidden="true" style="position:absolute;left:-4px;right:-6px;bottom:1px;height:45%;z-index:-1;background:${mix(c, 20)};transform:rotate(-0.7deg)"></span></strong>${body ? `<p style="margin:0;${ANNOT};font-size:12px;line-height:1.45;color:${C.muted}">${body}</p>` : ""}${extra}${
    actions.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">${actions
          .map(
            ([t, primary]) =>
              `<button type="button" style="min-height:40px;padding:6px 12px;border:1px solid ${c === C.hair ? hairline(80) : c};${CONTROLS};font-size:11px;font-weight:600;cursor:pointer;${primary ? `color:${C.accentFg};background:${c}` : `color:${C.ink};background:${mix(C.raised, 92, c)}`}">${t}</button>`,
          )
          .join("")}</div>`
      : ""
  }</div></div>`;
};

// The field tip: an inline shipping tag, so the Chrome or Edge upgrade is hard to miss.
export const tip = ({ title, body, action, after }) =>
  `<div style="position:relative;filter:drop-shadow(1px -1px 3px rgb(31 23 15 / 14%)) drop-shadow(2px 5px 10px rgb(31 23 15 / 20%));transform:rotate(-0.6deg);margin:6px 0 4px"><div style="display:flex;color:${C.tagInk};background:${C.tagPaper};clip-path:polygon(16px 0,100% 0,100% 100%,16px 100%,0 calc(100% - 16px),0 16px);-webkit-mask:radial-gradient(circle at 30px 50%,transparent 0 6px,#000 6.5px);mask:radial-gradient(circle at 30px 50%,transparent 0 6px,#000 6.5px)"><div style="flex:none;width:60px;display:flex;align-items:center;justify-content:center;border-right:1px dashed ${mix(C.tagInk, 35)}"><span style="width:30px;height:30px;box-sizing:border-box;border:7px solid ${C.tagAccent};border-radius:50%"></span></div><div style="flex:1;padding:14px 16px 16px;display:flex;flex-direction:column;gap:6px"><p style="margin:0;display:flex;align-items:center;gap:6px;${CONTROLS};font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${C.tagAccent}">${ti("bulb", 14, C.tagAccent)}Field tip</p><h3 style="margin:0;${DISPLAY};font-size:22px;line-height:1.1;color:${C.tagInk}">${title}</h3><p style="margin:0;${ANNOT};font-size:13px;line-height:1.45;color:${C.tagMuted}">${body}</p><div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:4px"><button type="button" style="display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border:1px solid ${C.tagAccent};background:${C.tagAccent};color:${C.tagHi};${CONTROLS};font-size:11px;cursor:pointer">${ti("link", 14)}${action}</button><span style="${ANNOT};font-size:12px;color:${C.tagMuted}">${after}</span></div></div></div></div>`;

// A step on the setup page, drawn as a DataCard: current steps open, others fold to a line.
export const stepCard = (n, title, { state = "todo", summary = "", body = "" } = {}) => {
  const rule = state === "done" ? C.green : state === "current" ? C.accent : hairline(60);
  const skipped = state === "skipped";
  return `<div style="border:1px solid ${hairline()};border-left:3px solid ${rule};background:${C.raised};box-shadow:0 1px 1px ${C.shadow}${state === "todo" ? ";opacity:.7" : ""}"><div style="display:flex;align-items:center;gap:10px;padding:12px 14px"><span aria-hidden="true" style="flex:none;width:26px;${DISPLAY};font-size:24px;line-height:1;color:${state === "done" ? C.green : skipped ? C.muted : C.accent}">${n}.</span><span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px"><span style="${BODY};font-size:16px;font-weight:600;line-height:1.1;color:${C.ink}">${title}</span>${summary ? `<span style="${BODY};font-size:12px;color:${C.muted}">${summary}</span>` : ""}</span>${state === "done" ? ti("circle-check", 18, C.green) : ""}${skipped && body ? body : ""}</div>${state === "current" && body ? `<div style="padding:10px 14px 16px;border-top:1px dashed ${hairline()};display:flex;flex-direction:column;gap:12px">${body}</div>` : ""}</div>`;
};

// Sonner toast as the app styles it.
export const toast = (t, icon = "info-circle") =>
  `<div role="status" style="display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;border-radius:12px;border:1px solid ${hairline(60)};background:${C.raised};padding:12px 16px;box-shadow:0 4px 12px ${C.shadow}">${ti(icon, 16, C.muted)}<span style="flex:1;${BODY};font-size:14px;color:${C.muted}">${t}</span></div>`;

// ui/dialog content over a scrim.
export const dialog = (title, desc, actions, extra = "") =>
  `<div role="dialog" aria-modal="true" style="position:absolute;inset:0;z-index:5;background:${C.scrim};display:flex;align-items:center;justify-content:center;padding:16px"><div style="width:100%;max-width:384px;box-sizing:border-box;background:${C.paper};border:1px solid ${hairline(60)};border-radius:4px;padding:24px;box-shadow:0 10px 30px ${C.shadow};display:flex;flex-direction:column;gap:12px"><h2 style="margin:0;${BODY};font-size:18px;font-weight:600;line-height:1.2;color:${C.ink}">${title}</h2>${desc ? `<p style="margin:0;${BODY};font-size:14px;line-height:1.5;color:${C.muted}">${desc}</p>` : ""}${extra}<div style="display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:6px">${actions.join("")}</div></div></div>`;

// Page chrome
// The floating toolbar. `sync` adds a quiet sync button that only speaks up with a dot & a slip
// when something is late or wrong; `panel` opens its foldout above the toolbar.
const toolbar = ({ sync, panel } = {}) => {
  const b = (ic, label, on, extra = "") =>
    `<button type="button" aria-label="${label}" style="position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:${on ? mix(C.accent, 14, C.raised) : C.raised};border:1px solid ${hairline(60)};box-shadow:0 2px 6px ${C.shadow};color:${C.ink}">${ti(ic, 18)}${extra}</button>`;
  let syncBtn = "";
  if (sync) {
    const tone = sync.tone;
    const dot = tone
      ? `<span aria-hidden="true" style="position:absolute;top:5px;right:5px;width:9px;height:9px;border-radius:50%;background:${tone};box-shadow:0 0 0 2px ${C.raised}"></span>`
      : "";
    syncBtn = b(
      "plug-connected",
      `Sync: ${sync.status ?? (tone ? "needs a look" : "up to date")}`,
      !!panel,
      dot,
    );
    if (sync.slip)
      syncBtn += `<span style="position:absolute;left:92px;bottom:54px;padding:5px 10px;background:${C.raised};border:1px solid ${mix(tone ?? C.hair, 55)};box-shadow:0 2px 6px ${C.shadow};${ANNOT};font-size:11px;color:${C.ink};transform:rotate(-1.2deg);white-space:nowrap">${sync.slip}</span>`;
  }
  const fold = panel
    ? `<div style="position:absolute;left:12px;right:12px;bottom:64px;z-index:4;border:1px solid ${hairline(58)};background:${C.raised};box-shadow:0 9px 24px ${C.shadow}"><div style="display:flex;min-height:40px;align-items:center;padding-left:14px;border-bottom:1px solid ${hairline(30)}"><span style="flex:1;${CONTROLS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${C.ink}">Sync</span><span style="width:40px;height:40px;display:grid;place-items:center;color:${C.muted}">${ti("x", 18)}</span></div>${panel
        .map(
          ([label, value]) =>
            `<div style="display:flex;min-height:32px;align-items:center;justify-content:space-between;gap:10px;padding:2px 14px"><span style="${ANNOT};font-size:11px;font-weight:500;letter-spacing:.02em;color:${C.muted}">${label}</span><span style="${BODY};font-size:14px;color:${C.ink};text-align:right">${value}</span></div>`,
        )
        .join(
          "",
        )}<div style="display:flex;min-height:44px;align-items:center;gap:8px;margin-top:4px;padding:0 14px;border-top:1px solid ${hairline(24)};${CONTROLS};font-size:11px;color:${C.muted}">${ti("settings", 16)}Pairing &amp; data settings</div></div>`
    : "";
  return `${fold}<div style="position:absolute;left:12px;right:12px;bottom:12px;z-index:3;display:flex;justify-content:space-between;pointer-events:none"><div style="display:flex;gap:6px">${b("settings", "Settings")}${b("message-report", "Feedback")}${syncBtn}</div><div style="display:flex;gap:6px">${b("search", "Search")}${b("filter", "Filters", true)}</div></div>`;
};

// The welcome card’s choices: equal filled options, each with its step count.
export const options = (list) =>
  `<div style="position:relative;z-index:1;display:grid;grid-template-columns:${list.length > 1 ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)"};gap:8px">${list
    .map(
      ([t, ic, sub]) =>
        `<button type="button" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-height:50px;padding:6px 12px;border:1px solid ${C.accent};color:${C.accentFg};background:${C.accent};cursor:pointer"><span style="display:flex;align-items:center;gap:8px;${CONTROLS};font-size:12px;font-weight:600">${ti(ic, 17)}${t}</span><span style="${ANNOT};font-size:11px;opacity:.85">${sub}</span></button>`,
    )
    .join("")}</div>`;
export const secondary = (t, ic = "pencil") =>
  `<button type="button" style="position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:8px 12px;border:1px solid ${mix(C.accent, 55)};background:${mix(C.raised, 92, C.accent)};color:${C.ink};${CONTROLS};font-size:12px;font-weight:600;cursor:pointer">${ti(ic, 17)}${t}</button>`;
export const cardLinks = (links) =>
  `<div style="position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:4px 18px;margin:-4px 0 -7px">${links.map((t) => `<button type="button" style="display:flex;align-items:center;gap:5px;min-height:32px;background:none;border:0;padding:0;${ANNOT};font-size:11px;color:${C.muted};text-decoration:underline dotted;text-underline-offset:3px;cursor:pointer">${t}</button>`).join("")}</div>`;
export const preview = (list) =>
  `<ol style="margin:4px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px">${list
    .map(
      ([n, t]) =>
        `<li style="display:flex;gap:8px;align-items:baseline"><span aria-hidden="true" style="width:18px;${DISPLAY};font-size:16px;color:${C.accent}">${n}.</span><span style="${ANNOT};font-size:12px;color:${C.muted}">${t}</span></li>`,
    )
    .join("")}</ol>`;

export const homeHeader = ({ right } = {}) =>
  `<header style="position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 22px 13px"><h1 style="margin:0;display:flex;align-items:center;gap:8px;${BRAND};font-size:24px;font-weight:400;line-height:1;color:${C.ink}">${ti("notebook", 20, C.mark)}Mistria Field Guide</h1>${right ?? `<span style="${DATA};font-size:12px;color:${C.muted};text-align:right;line-height:1.3">15%<br><span style="font-size:10px">812 / 5,402</span></span>`}<span aria-hidden="true" style="position:absolute;left:0;right:0;bottom:0;height:3px;background:${C.sunken}"><i style="display:block;width:15%;height:100%;background:${C.accent}"></i></span></header>`;

export const pageHeader = (title, { category } = {}) =>
  category
    ? `<header style="position:relative;display:flex;align-items:center;gap:8px;min-height:62px;box-sizing:border-box;padding:16px 69px 12px 16px;background:${C.raised};box-shadow:0 1px 1px ${C.shadow}"><span style="width:44px;height:44px;margin-left:-12px;display:flex;align-items:center;justify-content:center;color:${C.muted}">${ti("arrow-left", 20)}</span><h1 style="flex:1;margin:0;${DISPLAY};font-size:24px;line-height:1.15;color:${C.ink}">${title}</h1><span style="${DATA};font-size:12px;color:${C.muted}">186 / 409</span><span aria-hidden="true" style="position:absolute;top:7px;right:0;bottom:7px;width:52px;display:grid;place-items:center;color:#fdfcf9;background:${C.cat[category]};clip-path:polygon(0 0,100% 0,100% 100%,0 100%,8px 50%)">${ti("book", 22)}</span><span aria-hidden="true" style="position:absolute;left:0;right:0;bottom:0;height:3px;background:${mix(C.primary, 13)}"><i style="display:block;width:45%;height:100%;background:${C.primary}"></i></span></header>`
    : `<header style="display:flex;align-items:center;gap:8px;padding:16px 16px 12px;border-bottom:1px solid ${hairline(50)}"><span style="width:44px;height:44px;margin-left:-12px;display:flex;align-items:center;justify-content:center;color:${C.muted}">${ti("arrow-left", 20)}</span><h1 style="flex:1;margin:0;${DISPLAY};font-size:24px;line-height:1.15;color:${C.ink}">${title}</h1></header>`;

export const indexList = ({ dim = false } = {}) => {
  const cats = [
    ["almanac", "Almanac", "Crops, fish, forage, & more", "412 / 1,879"],
    ["animals", "Animals", "Breeds, variants, & cosmetics", "38 / 267"],
    ["cosmetics", "Cosmetics", "Wardrobe & appearances", "51 / 381"],
    ["mines", "Mines", "Floors & seals", "29 / 160"],
    ["museum", "Museum", "Collections & donations", "186 / 409"],
    ["quests", "Quests", "Story & requests", "72 / 369"],
  ];
  return `${eyebrow("Index")}<ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px${dim ? ";opacity:.5" : ""}">${cats
    .map(
      ([k, n, d, c]) =>
        `<li style="position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;min-height:58px;box-sizing:border-box;padding:6px 69px 6px 23px;background:${C.raised};box-shadow:0 1px 1px ${C.shadow}"><span><strong style="position:relative;isolation:isolate;display:block;width:fit-content;${BODY};font-size:16px;font-weight:600;line-height:1.2;color:${C.ink}">${n}<span aria-hidden="true" style="position:absolute;left:-5px;right:-8px;bottom:0;height:48%;z-index:-1;background:${mix(C.cat[k], 20)}"></span></strong><span style="display:block;margin-top:2px;${ANNOT};font-size:11px;color:${C.muted}">${d}</span></span><span style="${DATA};font-size:12px;color:${C.ink}">${c.replace(" / ", ` <span style="color:${C.cat[k]}">/</span> `)}</span><span aria-hidden="true" style="position:absolute;top:5px;right:-8px;bottom:5px;width:52px;padding-left:8px;box-sizing:border-box;display:grid;place-items:center;color:#fdfcf9;background:${C.cat[k]};clip-path:polygon(0 0,100% 0,100% 100%,0 100%,8px 50%)">${ti("book", 20)}</span></li>`,
    )
    .join("")}</ul>`;
};

// The tracker rows of a category page, with the app's slash checkbox.
export const trackerRows = ({ readOnly = false } = {}) => {
  const rows = [
    ["Crucian carp", "Eastern Road pond · Spring", true],
    ["Rainbow trout", "Narrows river", true],
    ["Sunfish", "Farm pond · Summer", false],
    ["Tadpole", "Farm pond · Spring", false],
    ["Mackerel", "Beach · Summer", true],
    ["Snapper", "Beach · Fall", false],
  ];
  return `<div style="display:flex;align-items:center;gap:8px;padding:10px 4px;${BODY};font-size:16px;font-weight:600;color:${C.ink}">${ti("chevron-right", 16, C.muted, "transform:rotate(90deg)")}Fish<span style="margin-left:auto;${DATA};font-size:12px;font-weight:400;color:${C.muted}">58 / 109</span></div><ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px">${rows
    .map(
      ([n, s, got]) =>
        `<li style="display:flex;align-items:center;gap:6px;padding:2px 10px 2px 2px;background:${C.raised};border-radius:2px;box-shadow:0 1px 1px ${C.shadow}${got ? `;color:${C.muted};text-decoration:line-through` : `;color:${C.ink}`}"><span ${readOnly ? 'role="checkbox" aria-disabled="true" aria-checked="' + got + '" ' : ""}style="width:44px;height:44px;display:flex;align-items:center;justify-content:center${readOnly ? ";opacity:.55" : ""}"><svg aria-hidden="true" width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="3.5" y="3.5" width="21" height="21" rx="1" stroke="${C.hair}" stroke-width="1.5"${readOnly ? ' stroke-dasharray="3 2.5"' : ""}></rect>${got ? `<path d="M9.5 20L18.5 8" stroke="${C.green}" stroke-width="2.5" stroke-linecap="round"></path>` : ""}</svg></span><span style="flex:1;${BODY};font-size:16px;line-height:1.3">${n}<span style="display:block;font-size:14px;color:${C.muted};text-decoration:none">${s}</span></span></li>`,
    )
    .join("")}</ul>`;
};

export const syncLine = (t, icon = "plug-connected", color) =>
  `<p style="margin:0;display:flex;align-items:center;gap:6px;padding:0 4px;${ANNOT};font-size:11px;color:${color ?? C.muted}">${ti(icon, 14, color ?? C.muted)}${t}</p>`;

// A screen: the 512 px column, centered on a PC frame or filling a phone. Home & category pages
// get the toolbar; Data & setup pages don’t.
export const screen = (inner, { device = "pc", w, h, toolbar: tb = true, overlay = "" } = {}) => {
  const W = w ?? (device === "pc" ? 1280 : 390);
  const H = h ?? (device === "pc" ? 800 : 844);
  const colW = device === "pc" ? 512 : W;
  return `<div style="position:relative;width:${W}px;height:${H}px;box-sizing:border-box;background:${C.paper};color:${C.ink};${BODY};overflow:hidden;display:flex;justify-content:center"><div style="position:relative;width:${colW}px;height:100%;display:flex;flex-direction:column">${inner}${tb ? toolbar(tb === true ? {} : tb) : ""}</div>${overlay}</div>`;
};
// Home content sits 15 px below the header, as .home-page’s gap does.
export const content = (inner, gap = 12) =>
  `<div style="display:flex;flex-direction:column;gap:${gap}px;padding:15px 16px 80px">${inner}</div>`;
export const dataPage = (inner) =>
  `${pageHeader("Data management")}<div style="display:flex;flex-direction:column;gap:22px;padding:18px 16px 32px">${note("Pair your devices, or import, back up, or reset your Field Guide progress.", 14)}${inner}</div>`;
export const setupPage = (title, lead, inner) =>
  `${pageHeader(title)}<div style="display:flex;flex-direction:column;gap:12px;padding:18px 16px 32px">${lead ? note(lead, 14) : ""}${inner}</div>`;
export const section = (h, inner) =>
  `<section>${eyebrow(h)}<div style="display:flex;flex-direction:column;gap:10px">${inner}</div></section>`;

export const FONTS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Petrona:wght@400;500;600;700&amp;family=Fragment+Mono&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap">`;

// A visible “How it works” control: full tap height, ink text, a help mark.
export const howLink = (t = "How it works") =>
  `<button type="button" style="position:relative;z-index:1;display:inline-flex;align-items:center;gap:7px;width:fit-content;min-height:44px;padding:0 2px;background:none;border:0;${BODY};font-size:14px;font-weight:500;color:${C.ink};text-decoration:underline dotted;text-decoration-color:${mix(C.accent, 70)};text-underline-offset:4px;cursor:pointer">${ti("help-circle", 17, C.accent)}${t}</button>`;
// Two columns, each a filled option with its own quieter choice under it.
export const optionCols = (cols) =>
  `<div style="position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:start">${cols
    .map(
      ([opt, under]) =>
        `<div style="display:flex;flex-direction:column;gap:6px">${options([opt])}${under}</div>`,
    )
    .join("")}</div>`;
// What setup gets you, as a short list with marks.
export const features = (list) =>
  `<ul style="margin:6px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px">${list
    .map(
      ([ic, t]) =>
        `<li style="display:flex;gap:9px;align-items:center;${BODY};font-size:14px;color:${C.ink}">${ti(ic, 17, C.accent)}${t}</li>`,
    )
    .join("")}</ul>`;
// A choice on the setup page, drawn like a DataCard with its own actions.
export const choiceCard = ({ icon, title, sub, body = "", actions = "" }) =>
  `<div style="border:1px solid ${hairline()};border-left:3px solid ${C.accent};background:${C.raised};box-shadow:0 1px 1px ${C.shadow};padding:14px 14px 12px;display:flex;flex-direction:column;gap:10px"><div style="display:flex;gap:10px;align-items:flex-start">${ti(icon, 20, C.accent, "margin-top:1px")}<div style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="${BODY};font-size:16px;font-weight:600;line-height:1.15;color:${C.ink}">${title}</span><span style="${CONTROLS};font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${C.muted}">${sub}</span></div></div>${body}${actions}</div>`;
// Paste a pairing link: a 16 px field and its button.
export const pasteField = (value = "") =>
  `<div style="display:flex;gap:8px"><input aria-label="Pairing link" placeholder="Paste the link here" value="${value}" style="flex:1;min-width:0;min-height:44px;box-sizing:border-box;padding:0 12px;border:1px solid ${hairline(60)};border-radius:2px;background:${C.paper};${DATA};font-size:16px;color:${C.ink}">${btn("Pair", { kind: "default" })}</div>`;
// A path on the setup page: the whole card is the button. `extra` sits under it, outside the
// button, for a control of its own (“How it works”).
export const pathChoice = ({ icon, title, sub, body, extra = "" }) =>
  `<div style="border:1px solid ${hairline()};border-left:3px solid ${C.accent};background:${C.raised};box-shadow:0 1px 1px ${C.shadow}"><button type="button" style="display:flex;width:100%;align-items:center;gap:12px;padding:14px 14px 14px 14px;background:none;border:0;text-align:left;cursor:pointer;color:${C.ink}">${ti(icon, 22, C.accent)}<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px"><span style="${BODY};font-size:17px;font-weight:600;line-height:1.15">${title}</span><span style="${CONTROLS};font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${C.accent}">${sub}</span><span style="${ANNOT};font-size:13px;line-height:1.4;color:${C.muted}">${body}</span></span>${ti("chevron-right", 20, C.muted)}</button>${extra ? `<div style="padding:0 14px 2px 48px;border-top:1px dashed ${hairline()}">${extra}</div>` : ""}</div>`;
export const orRule = () =>
  `<div aria-hidden="true" style="display:flex;align-items:center;gap:10px;margin:-2px 0;${DISPLAY};font-size:18px;color:${C.muted}"><span style="flex:1;height:1px;background:${hairline(50)}"></span>or<span style="flex:1;height:1px;background:${hairline(50)}"></span></div>`;
// A checkbox row with a 44 px target, drawn like the tracker’s box.
export const checkRow = (label, sub = "", checked = true) =>
  `<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><span style="flex:none;width:44px;height:44px;margin:-10px -8px -10px -10px;display:grid;place-items:center"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="2.5" width="19" height="19" rx="1" stroke="${checked ? C.primary : C.hair}" stroke-width="1.5" fill="${checked ? mix(C.primary, 10) : "none"}"></rect>${checked ? `<path d="M7 12.5l3.2 3.2L17 8.5" stroke="${C.primary}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>` : ""}</svg></span><span style="display:flex;flex-direction:column;gap:2px"><span style="${BODY};font-size:15px;font-weight:500;color:${C.ink}">${label}</span>${sub ? `<span style="${ANNOT};font-size:12px;line-height:1.4;color:${C.muted}">${sub}</span>` : ""}</span></label>`;
