// Every board on the save file sync canvas, by row, plus the canvas notes. Copy comes from the
// copy table in docs/sync-setup.md; change it there first, then here.
import * as k from "./kit.mjs";

const {
  p,
  note,
  code,
  b,
  row,
  col,
  btn,
  qrBand,
  dropZone,
  waiting,
  dataCard,
  welcome,
  tagDialog,
  fieldNote,
  stepCard,
  homeHeader,
  indexList,
  syncLine,
  screen,
  content,
  dataPage,
  setupPage,
  section,
  pasteField,
  textLink,
  switchLink,
  pathChoice,
  orRule,
  ti,
  hairline,
} = k;
const C = () => k.C;
const mix = (color, pct, base) => `color-mix(in srgb, ${color} ${pct}%, ${base ?? "transparent"})`;
const MONO = "font-family:'Fragment Mono','Courier New',monospace";
const ANNOT = "font-family:Satoshi,system-ui,sans-serif";
const DATA = "font-family:'IBM Plex Mono','Courier New',monospace";
const SERIF = "font-family:Petrona,Georgia,serif";

const PC = { w: 1280, h: 800 };
const PH = { w: 390, h: 844 };
const FILE = "game-1315159680-autosave.sav";
const PATH = "%LOCALAPPDATA%\\FieldsOfMistria\\saves";

// ── Pieces ──
const home = (top, { device = "pc", h, overlay, list = true, toolbar = true } = {}) =>
  screen(homeHeader() + content((top ?? "") + (list ? indexList() : "")), {
    device,
    h,
    overlay,
    toolbar,
  });
const syncPage = (lead, inner, { device = "pc", h, overlay } = {}) =>
  screen(setupPage("Sync your save file", lead, inner), { device, h, overlay, toolbar: false });
const dataScreen = (inner, { device = "pc", h, overlay } = {}) =>
  screen(dataPage(inner), { device, h, overlay, toolbar: false });
const small = (t, icon) => btn(t, { size: "sm", icon });
const dim = (inner, on) =>
  `<div ${on ? "" : 'aria-disabled="true" '}style="display:flex;flex-direction:column;gap:10px${on ? "" : ";opacity:.42"}">${inner}</div>`;

// Home’s two whole-card choices, each with its subtitle.
const bigChoice = (t, sub, ic, primary) =>
  `<button type="button" style="position:relative;z-index:1;display:flex;align-items:center;gap:12px;width:100%;min-height:58px;padding:10px 14px;text-align:left;border:1px solid ${C().accent};cursor:pointer;${primary ? `color:${C().accentFg};background:${C().accent}` : `color:${C().ink};background:${mix(C().raised, 92, C().accent)}`}">${ti(ic, 20)}<span style="display:flex;flex-direction:column;gap:3px"><span style="${MONO};font-size:13px;font-weight:600">${t}</span><span style="${ANNOT};font-size:12px;opacity:.85">${sub}</span></span></button>`;
const welcomeCard = (device) =>
  welcome({
    overline: "New field guide",
    title: "Ready to get started?",
    body: note(
      "Let’s get you set up to keep track of all that hard work. How do you wanna work?",
      14,
    ),
    foot: col(
      [
        bigChoice(
          "Sync from my farm automagically",
          device === "pc"
            ? "Set up in 2 minutes, plus phone sync"
            : "Set up in 2 minutes from your gaming computer",
          "sparkles",
          true,
        ),
        bigChoice("I’ll track it all by hand", "The way my ancestors did it", "pencil", false),
      ],
      8,
    ),
  });

const headsUp = (device) =>
  fieldNote({
    icon: "info-circle",
    title: "Heads up",
    body:
      device === "pc"
        ? "Only the game’s save file gets synced; anything you check off by hand on this computer stays here. Easiest is to track on one device, like your phone, and let your gaming computer just read the save file."
        : "Only the game’s save file gets synced; anything you check off by hand on this phone stays here. Easiest is to do all your tracking right here, and let your gaming computer just read the save file.",
    tilt: -0.3,
  });

const OTHER = pathChoice({
  icon: "device-mobile",
  title: "My save file is on another device",
  sub: "Like my gaming computer",
  body: "Scan a code from the computer that runs the game.",
});
const HERE = pathChoice({
  icon: "device-desktop",
  title: "My save file is on this computer",
  sub: "I play right here",
  body: "Read it here, and share it with your phone.",
});
const HAND = pathChoice({
  icon: "pencil",
  title: "I’ll track it all by hand",
  sub: "No save file",
  body: "Check things off yourself. You can still import a save file now and then.",
});
const where = (inner) =>
  `<h2 style="margin:4px 0 0;font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-weight:400;font-size:26px;line-height:1.1;color:${C().ink}">Where’s your save file?</h2>${inner}`;
const chooser = ({ mac = false, overlay } = {}) =>
  syncPage(
    "",
    where(
      mac
        ? OTHER +
            orRule() +
            HAND +
            `<div>${small("The game runs on this Mac", "device-laptop")}</div>`
        : OTHER + HERE + HAND,
    ) +
      headsUp("pc") +
      row([small("On a phone?", "device-mobile")]),
    { overlay, h: mac ? 860 : 900 },
  );

const freshDialog = (narrow) =>
  tagDialog({
    title: "FYI, this is a fresh start",
    desc: "You’ll be starting fresh by syncing your save file, which means anything you’ve tracked on this device will be cleared. Your save file will check off nearly everything on its own, but you can make a quick backup first if you’d like.",
    actions: [["Make a backup"], ["I’m ready to start anew", true], ["Cancel"]],
    narrow,
  });

// The folder to copy; the drop box wakes up once it’s copied.
const pathRow = (copied) =>
  `<div style="display:flex;align-items:center;gap:8px;border:1px solid ${copied ? C().green : hairline(60)};background:${C().sunken};border-radius:2px;padding:6px 6px 6px 12px"><code style="flex:1;${DATA};font-size:12px;word-break:break-all;color:${C().ink}">${PATH}</code><button type="button" style="display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border:1px solid ${copied ? C().green : hairline(60)};background:${copied ? mix(C().green, 12, C().raised) : C().paper};color:${copied ? C().green : C().ink};${MONO};font-size:12px;cursor:pointer">${ti(copied ? "check" : "copy", 15)}${copied ? "Copied!" : "Copy"}</button></div>`;
const helpToggle = (open) =>
  `<button type="button" aria-expanded="${open}" style="display:flex;align-items:center;gap:6px;min-height:44px;padding:0;background:none;border:0;${SERIF};font-size:14px;font-weight:600;color:${C().ink};cursor:pointer">${ti("chevron-right", 16, C().muted, open ? "transform:rotate(90deg)" : "")}Can’t find it?</button>`;
const HELP = `<div style="display:flex;flex-direction:column;gap:10px;padding:2px 0 4px 22px;border-left:2px solid ${hairline(40)}">${p("Make sure you pasted it into the address bar at the very top of File Explorer, not the search box.", 13)}${p(`Still nothing? Press the Windows key + R, paste the same folder location, and press Enter. <span style="color:${C().muted}">(That only opens a folder. Never paste anything else into that box, from us or anyone.)</span>`, 13)}</div>`;
// Two halves, both visible, one active: copy the folder, then drag the file in.
const findBody = ({ copied = false, help = false } = {}) =>
  p(
    "Gonna be honest, this is the weirdest part of the setup. But once you’re done here, it’s smooth sailing!",
  ) +
  dim(
    p("First, copy this folder location:") +
      pathRow(copied) +
      switchLink("On Linux, Steam Deck, or a Mac?"),
    !copied,
  ) +
  dim(
    p(
      `Now open File Explorer and paste that into the address bar at the top. It should take you to a folder with files like ${code("game-[numbers]-autosave.sav")}. Drag that autosave file into this box:`,
    ) +
      dropZone({
        label: copied
          ? "Drop your autosave here"
          : "Copy the folder first, and this box will wake up.",
        browse: false,
      }) +
      `<div>${textLink("Can’t drag? Choose the file instead", "font-size:13px")}</div>` +
      helpToggle(help) +
      (help ? HELP : ""),
    copied,
  );
const step1 = (o) => stepCard("i", "Find your save file", { state: "current", body: findBody(o) });
const step1Done = () => stepCard("i", "Find your save file", { state: "done", summary: FILE });
const step2Todo = () => stepCard("ii", "Is this your farm?", { state: "todo" });
const step2Done = () =>
  stepCard("ii", "Is this your farm?", { state: "done", summary: "Robin on Sunny Meadow Farm" });
const step3Todo = () => stepCard("iii", "Wanna track this on your phone?", { state: "todo" });
const farmBody = (unnamed) =>
  p(
    unnamed
      ? "Perfect! We found a farm in that save file. Is it yours?"
      : `Perfect! Looks like that save file is for ${b("Robin")} on ${b("Sunny Meadow Farm")}, is that right?`,
    15,
  ) + row([btn("Yep!", { kind: "default", icon: "check" }), btn("Hmm, no, try that again")]);
// The code area holds the code’s whole life; the footer holds the way out.
const copyLink = (state) =>
  state === "paused"
    ? ""
    : `<div style="display:flex;flex-direction:column;align-items:center;gap:2px${state === "generating" ? ";opacity:.45" : ""}">${small("Copy link", "link")}<span style="${ANNOT};font-size:11px;color:${C().muted}">For a computer with no camera</span></div>`;
const shareBody = (state) =>
  p("Or another device. Scan this code with it, and it’ll sync your save file from here on out.") +
  qrBand(
    state,
    state === "paused" ? "" : "Live on stream? Maybe don’t show this bit.",
    copyLink(state),
  ) +
  `<div style="display:flex;justify-content:flex-end;margin:0 -14px -16px;padding:10px 14px;border-top:1px dashed ${hairline()}">${
    state === "paused"
      ? btn("Okay, I’ll set it up later", { kind: "default" })
      : btn("No thanks, I’ll track here", { kind: "ghost" })
  }</div>`;
const share = (state) =>
  stepCard("iii", "Wanna track this on your phone?", { state: "current", body: shareBody(state) });
const pcSetup = (inner, h = 800, overlay) => syncPage("", inner, { h, overlay });

const DONE = k.status(
  "success",
  `<strong style="font-size:16px">Nice, you’re all set!</strong>${p("While this tab’s open, we’ll sync your save file every time you sleep. So leave it open while you play!", 14, "inherit")}<div style="margin-top:4px">${btn("Go to my field guide", { kind: "default", icon: "arrow-right" })}</div>`,
);

const redropStep = () =>
  stepCard("i", "Find your save file", {
    state: "current",
    body:
      dim(p("First, copy this folder location:") + pathRow(true), false) +
      dim(
        p("Open it in File Explorer and drag your newest autosave in.") +
          dropZone({ label: "Drop your autosave here" }) +
          note("Whenever you’re done playing, drop your save file in again and we’ll sync it."),
        true,
      ),
  });

// Phone pieces
const scanStep = () =>
  stepCard("i", "Scan the code from your gaming computer", {
    state: "current",
    body:
      p(
        `On your gaming computer, open ${code("mistria.fyi/sync")} in Chrome or Edge and go through the steps there. When it shows a code, scan it here.`,
      ) +
      btn("Scan the code", { kind: "default", icon: "camera", full: true }) +
      note("Or paste a link") +
      pasteField(),
  });
const phoneScan = (overlay, extra = "") =>
  syncPage(
    "",
    scanStep() +
      extra +
      headsUp("phone") +
      row([
        small("I’ll track it all by hand", "pencil"),
        small("On a computer?", "device-desktop"),
      ]),
    { device: "phone", overlay },
  );

const PANEL = [
  ["Save file from", "Your gaming computer"],
  ["Last save file", "7:42 PM"],
  ["In-game date", "Summer 14, Year 2"],
];
const PC_PANEL = [
  ["Save file", FILE],
  ["Last save file", "7:42 PM"],
  ["Your code", "Show code"],
];

// Data
const dl = (pairs) =>
  `<dl style="margin:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 16px">${pairs
    .map(
      ([t, d]) =>
        `<dt style="${ANNOT};font-size:12px;color:${C().muted}">${t}</dt><dd style="margin:0;${SERIF};font-size:14px;color:${C().ink};word-break:break-all">${d}</dd>`,
    )
    .join("")}</dl>`;
// Each action says what it’s for.
const action = (button, why) =>
  `<div style="display:grid;grid-template-columns:200px minmax(0,1fr);gap:12px;align-items:center">${button}<span style="${ANNOT};font-size:12px;line-height:1.4;color:${C().muted}">${why}</span></div>`;
const actionPhone = (button, why) =>
  `<div style="display:flex;flex-direction:column;gap:4px">${button}<span style="${ANNOT};font-size:12px;line-height:1.4;color:${C().muted}">${why}</span></div>`;
const syncCard = (pc, extra = "") =>
  dataCard("Save File Sync", "", {
    open: true,
    body: pc
      ? dl([
          ["Save file", FILE],
          ["Last save file", "Today, 7:42 PM"],
          ["Farm", "Robin on Sunny Meadow Farm"],
        ]) +
        note("Keep this tab open while you play so we can sync your save file.") +
        extra +
        col(
          [
            action(
              btn("Show code", { icon: "qrcode", full: true }),
              "Add your phone or another device.",
            ),
            action(
              btn("Make a new code", { icon: "refresh", full: true }),
              "Stops the old code, in case it ended up on stream or somewhere you didn’t mean.",
            ),
            action(
              btn("Stop syncing", { icon: "player-pause", full: true }),
              "Go back to checking things off by hand. Your progress stays.",
            ),
          ],
          8,
        )
      : dl([
          ["Save file from", "Your gaming computer"],
          ["Last save file", "Today, 7:42 PM"],
          ["Farm", "Robin on Sunny Meadow Farm"],
        ]) +
        extra +
        col(
          [
            actionPhone(
              btn("Scan a different code", { icon: "camera", full: true }),
              "Sync a save file from a different computer.",
            ),
            actionPhone(
              btn("Stop syncing", { icon: "player-pause", full: true }),
              "Go back to checking things off by hand. Your progress stays.",
            ),
          ],
          10,
        ),
  });
const dataRest = () =>
  section(
    "Data",
    dataCard("Backup & Restore", "Keep a copy of your progress, or restore one.") +
      dataCard("Danger Zone", "Reset your progress.", { tone: "danger" }),
  );
const dataBoard = (pc, { extra = "", overlay, h } = {}) =>
  dataScreen(section("Save file sync", syncCard(pc, extra)) + dataRest(), {
    device: pc ? "pc" : "phone",
    overlay,
    h,
  });

const gotIt = () =>
  fieldNote({
    tone: C().green,
    icon: "circle-check",
    title: "Got it!",
    body: "Your farm as of 7:42 PM. We’ll keep up from here. Anything you check off by hand on this phone stays here.",
  });

// ── Rows ──
export const rows = [
  {
    id: "start",
    title: "Getting started: Home & “Where’s your save file?”",
    boards: [
      {
        file: "Main.dc.html",
        title: "Computer · Home: “Ready to get started?”",
        ...PC,
        render: () => home(welcomeCard("pc")),
      },
      {
        file: "Home-Dark.dc.html",
        title: "Computer · Home, dark mode",
        ...PC,
        dark: true,
        render: () => home(welcomeCard("pc")),
      },
      {
        file: "Phone-Home.dc.html",
        title: "Phone · Home, phone subtitle",
        ...PH,
        h: 900,
        render: () => home(welcomeCard("phone"), { device: "phone", h: 900 }),
      },
      {
        file: "Where.dc.html",
        title: "Computer · Where’s your save file?",
        ...PC,
        h: 900,
        render: () => chooser(),
      },
      {
        file: "Where-Mac.dc.html",
        title: "Mac · “On this computer” becomes a small button",
        ...PC,
        h: 860,
        render: () => chooser({ mac: true }),
      },
      {
        file: "Fresh-Start.dc.html",
        title: "Computer · Starting to sync with progress: a fresh start",
        ...PC,
        h: 900,
        render: () => chooser({ overlay: freshDialog(false) }),
      },
    ],
  },
  {
    id: "computer",
    title: "On the gaming computer: one file, then maybe a code",
    boards: [
      {
        file: "Find-Locked.dc.html",
        title: "i · First half: copy the folder",
        ...PC,
        h: 1000,
        render: () => pcSetup(step1() + step2Todo() + step3Todo(), 1000),
      },
      {
        file: "Find-Copied.dc.html",
        title: "i · Second half: drag the file in",
        ...PC,
        h: 1000,
        render: () => pcSetup(step1({ copied: true }) + step2Todo() + step3Todo(), 1000),
      },
      {
        file: "Find-Help.dc.html",
        title: "i · “Can’t find it?”, safe steps first",
        ...PC,
        h: 1140,
        render: () =>
          pcSetup(step1({ copied: true, help: true }) + step2Todo() + step3Todo(), 1140),
      },
      {
        file: "Farm.dc.html",
        title: "ii · Is this your farm?",
        ...PC,
        render: () =>
          pcSetup(
            step1Done() +
              stepCard("ii", "Is this your farm?", { state: "current", body: farmBody(false) }) +
              step3Todo(),
          ),
      },
      {
        file: "Farm-Unnamed.dc.html",
        title: "ii · An unnamed farm",
        ...PC,
        render: () =>
          pcSetup(
            step1Done() +
              stepCard("ii", "Is this your farm?", { state: "current", body: farmBody(true) }) +
              step3Todo(),
          ),
      },
      {
        file: "Share.dc.html",
        title: "iii · Phone too? The default, with “No thanks”",
        ...PC,
        h: 940,
        render: () => pcSetup(step1Done() + step2Done() + share("covered"), 940),
      },
      {
        file: "Share-Making.dc.html",
        title: "iii · Generating the code, in place",
        ...PC,
        h: 940,
        render: () => pcSetup(step1Done() + step2Done() + share("generating"), 940),
      },
      {
        file: "Share-Shown.dc.html",
        title: "iii · The code, once its mailbox exists",
        ...PC,
        h: 940,
        qr: true,
        render: () => pcSetup(step1Done() + step2Done() + share("shown"), 940),
      },
      {
        file: "Share-Failed.dc.html",
        title: "iii · Sync is paused: setting up later is the way out",
        ...PC,
        render: () => pcSetup(step1Done() + step2Done() + share("paused")),
      },
      {
        file: "Done.dc.html",
        title: "Done: keep the tab open, then go to the field guide",
        ...PC,
        render: () =>
          pcSetup(
            DONE +
              step1Done() +
              step2Done() +
              stepCard("iii", "Wanna track this on your phone?", {
                state: "done",
                summary: "Your code’s ready any time in Data",
              }),
          ),
      },
      {
        file: "Redrop.dc.html",
        title: "Another browser: the Chrome tip, dismissible",
        ...PC,
        h: 900,
        render: () =>
          pcSetup(
            redropStep() + step2Todo() + step3Todo(),
            900,
            tagDialog({
              title: "Let Chrome do this for you",
              desc: "In Chrome or Edge, we can sync your save file every time you sleep, no dropping it in again.",
              body: note("Copy this page’s link, then paste it into Chrome or Edge."),
              actions: [["I’ll stick with this browser"], ["Copy this page’s link", true]],
            }),
          ),
      },
      {
        file: "Redrop-Page.dc.html",
        title: "Another browser: drop it in again after you play",
        ...PC,
        h: 900,
        render: () => pcSetup(redropStep() + step2Todo() + step3Todo(), 900),
      },
    ],
  },
  {
    id: "phone_setup",
    title: "On another device: scan, and it’s there",
    boards: [
      {
        file: "Phone-Scan.dc.html",
        title: "Phone · Scan the code",
        ...PH,
        render: () => phoneScan(),
      },
      {
        file: "Phone-Got-It.dc.html",
        title: "Phone · Got it!",
        ...PH,
        h: 900,
        render: () => home(gotIt(), { device: "phone", h: 900, toolbar: { sync: {} } }),
      },
      {
        file: "Phone-Got-It-Dark.dc.html",
        title: "Phone · Got it!, dark mode",
        ...PH,
        h: 900,
        dark: true,
        render: () => home(gotIt(), { device: "phone", h: 900, toolbar: { sync: {} } }),
      },
      {
        file: "Phone-Waiting.dc.html",
        title: "Phone · The code works, but no save file yet",
        ...PH,
        render: () =>
          syncPage(
            "",
            fieldNote({
              icon: "clock",
              title: "Almost there",
              body: "Your code works, but there’s no save file waiting yet. Open the tracker on your gaming computer, and we’ll grab the latest one.",
              extra: waiting("Waiting for your save file…"),
            }) + note("Nothing on this phone changes until a save file arrives."),
            { device: "phone" },
          ),
      },
      {
        file: "Phone-iOS.dc.html",
        title: "iPhone browser · During setup, before syncing: here, or the app?",
        ...PH,
        render: () =>
          phoneScan(
            tagDialog({
              title: "Quick question: here, or the home screen app?",
              desc: "Safari can clear a site’s data if you don’t visit for a week. The home screen app hangs on to it.",
              actions: [["I’ll use the app"], ["Sync in Safari", true]],
              narrow: true,
            }),
          ),
      },
      {
        file: "Phone-Switch.dc.html",
        title: "Phone · Already syncing, opens another computer’s code",
        ...PH,
        render: () =>
          home("", {
            device: "phone",
            toolbar: { sync: {} },
            overlay: tagDialog({
              title: "Sync this save file instead?",
              desc: "This device will start getting a different save file. If it’s a different farm, we’ll back up the current one, but only one backup fits, so you might want to make your own first.",
              actions: [["Make a backup"], ["Switch it", true], ["Cancel"]],
              narrow: true,
            }),
          }),
      },
      {
        file: "Phone-Fresh.dc.html",
        title: "Phone · Starting to sync with progress: a fresh start",
        ...PH,
        render: () => phoneScan(freshDialog(true)),
      },
      {
        file: "Phone-Bad-Link.dc.html",
        title: "Phone · A link that doesn’t parse",
        ...PH,
        render: () =>
          phoneScan(
            "",
            k.status(
              "warning",
              p(
                "Hmm, that link doesn’t look quite right. Try scanning the code instead?",
                14,
                "inherit",
              ),
            ),
          ),
      },
    ],
  },
  {
    id: "living",
    title: "Living with it: quiet until it isn’t",
    boards: [
      {
        file: "Phone-Quiet.dc.html",
        title: "Phone · Up to date: a quiet button",
        ...PH,
        render: () => home("", { device: "phone", toolbar: { sync: {} } }),
      },
      {
        file: "Phone-Panel.dc.html",
        title: "Phone · The sync panel",
        ...PH,
        render: () => home("", { device: "phone", toolbar: { sync: {}, panel: PANEL } }),
      },
      {
        file: "Phone-Gap.dc.html",
        title: "Phone · A long gap: the slip",
        ...PH,
        render: () =>
          home("", {
            device: "phone",
            toolbar: {
              sync: {
                tone: C().amber,
                status: "no new saves in a while",
                slip: "Haven’t heard from your game in 5 days",
              },
            },
          }),
      },
      {
        file: "Phone-Unreadable.dc.html",
        title: "Phone · A save file it can’t read either",
        ...PH,
        render: () =>
          home(
            fieldNote({
              tone: C().amber,
              icon: "alert-triangle",
              title: "Your computer is having trouble reading your save file",
              body: "Your progress is safe! For more info, check Mistria Field Guide on your computer.",
            }),
            { device: "phone", toolbar: { sync: { tone: C().amber, status: "needs a look" } } },
          ),
      },
      {
        file: "Phone-Retired.dc.html",
        title: "Phone · The computer made a new code",
        ...PH,
        render: () =>
          home(
            fieldNote({
              tone: C().amber,
              icon: "qrcode",
              title: "Your computer stopped sharing this save file",
              body: "Scan its new code to keep syncing.",
              actions: [["Scan the code", true]],
            }),
            { device: "phone", toolbar: { sync: { tone: C().amber, status: "needs a look" } } },
          ),
      },
      {
        file: "PC-Panel.dc.html",
        title: "Computer · Home: keep the tab open",
        ...PC,
        render: () =>
          home(
            syncLine("Keep this tab open while you play so we can sync your save file.", "clock"),
            { toolbar: { sync: {}, panel: PC_PANEL } },
          ),
      },
    ],
  },
  {
    id: "trouble",
    title: "Trouble on the gaming computer",
    boards: [
      {
        file: "PC-Unreadable.dc.html",
        title: "Computer · Hmm, we can’t read your save file",
        ...PC,
        h: 900,
        render: () =>
          home(
            fieldNote({
              tone: C().red,
              icon: "alert-circle",
              title: "Hmm, we can’t read your save file",
              extra: col(
                [
                  p(`${b("Number one:")} nothing is lost. Your progress is totally safe.`, 13),
                  p(
                    `${b("Number two:")} this isn’t anything you did. It can happen when <em>Fields of Mistria</em> releases an update. Rest assured that we’re on the case, and this field guide should be updated shortly. When it is, it’ll read your save file again and catch up on everything you’ve done in the meantime.`,
                    13,
                  ),
                  p(
                    "For now, just leave this tab open, and enjoy… whatever is in the new update!",
                    13,
                  ),
                ],
                8,
              ),
            }),
            { h: 900, toolbar: { sync: { tone: C().red, status: "can’t read the save file" } } },
          ),
      },
      {
        file: "PC-Reallow.dc.html",
        title: "Computer · After a browser restart",
        ...PC,
        render: () =>
          home(
            fieldNote({
              tone: C().amber,
              icon: "folder",
              title: "Mind letting us read your save file again?",
              body: "Your browser asks after a restart.",
              actions: [["Let us read it", true]],
            }),
            { toolbar: { sync: { tone: C().amber, status: "needs a look" } } },
          ),
      },
      {
        file: "PC-Moved.dc.html",
        title: "Computer · The save file moved",
        ...PC,
        h: 900,
        render: () =>
          home(
            fieldNote({
              tone: C().amber,
              icon: "folder",
              title: "We lost track of your save file",
              body: "Drop it in again and we’re back in business.",
              extra: col(
                [pathRow(false), dropZone({ label: "Drop your autosave here", browse: false })],
                10,
              ),
            }),
            { h: 900, toolbar: { sync: { tone: C().amber, status: "needs a look" } } },
          ),
      },
      {
        file: "PC-Paused.dc.html",
        title: "Computer · Sync is paused, & comes back by itself",
        ...PC,
        render: () =>
          home(
            fieldNote({
              icon: "player-pause",
              title: "Sync is paused for now",
              body: "We’ve paused syncing for a bit to keep things running smoothly. It’ll turn back on by itself, usually by tomorrow, and catch up then. Checking things off by hand still works.",
            }),
            { toolbar: { sync: { tone: C().hair, status: "paused" } } },
          ),
      },
      {
        file: "PC-Offline.dc.html",
        title: "Computer · Can’t connect",
        ...PC,
        render: () =>
          home(
            fieldNote({
              icon: "wifi-off",
              title: "We can’t connect right now",
              body: "We’ll keep trying, or you can try again.",
              actions: [["Try again", false]],
            }),
            { toolbar: { sync: { tone: C().hair, status: "can’t connect" } } },
          ),
      },
      {
        file: "PC-Other-Window.dc.html",
        title: "Computer · Another window is syncing",
        ...PC,
        render: () =>
          home(
            fieldNote({
              icon: "info-circle",
              title: "Your save file is already syncing in another window.",
            }),
            { toolbar: { sync: {} } },
          ),
      },
    ],
  },
  {
    id: "data",
    title: "Data: what each action is for",
    boards: [
      {
        file: "Data-PC.dc.html",
        title: "Computer · Data: save file sync",
        ...PC,
        h: 860,
        render: () => dataBoard(true, { h: 860 }),
      },
      {
        file: "Data-Phone.dc.html",
        title: "Phone · Data: save file sync",
        ...PH,
        render: () => dataBoard(false),
      },
      {
        file: "Data-New-Code.dc.html",
        title: "Computer · Make a new code",
        ...PC,
        h: 860,
        render: () =>
          dataBoard(true, {
            h: 860,
            overlay: tagDialog({
              title: "Make a new code",
              desc: "Showed your code on stream? No problem. A new code stops the old one, so your other devices will need to scan again.",
              actions: [["Never mind"], ["Make a new code", true]],
            }),
          }),
      },
      {
        file: "Data-New-Code-Failed.dc.html",
        title: "Computer · Couldn’t make a new code",
        ...PC,
        h: 940,
        render: () =>
          dataBoard(true, {
            h: 940,
            extra: k.status(
              "warning",
              p(
                "We couldn’t make a new code right now, so your old one still works. Try again in a bit.",
                14,
                "inherit",
              ),
            ),
          }),
      },
      {
        file: "Data-Stop.dc.html",
        title: "Phone · Stop syncing: progress stays",
        ...PH,
        render: () =>
          dataBoard(false, {
            overlay: tagDialog({
              title: "Stop syncing?",
              desc: "Your progress stays right here, and you’ll check things off by hand from now on. If you turn syncing back on later, it’ll start fresh.",
              actions: [["Cancel"], ["Stop syncing", true]],
              narrow: true,
            }),
          }),
      },
    ],
  },
];

export const notes = {
  n_start: {
    row: "start",
    text: "Home asks how you want to work; “Sync” opens mistria.fyi/sync, which asks where the save file is. “On this computer” shows only on a computer, & on a Mac it’s a small button. Starting to sync with progress confirms a fresh start; the erase lands with the first save file, so backing out changes nothing.",
    fill: "green",
  },
  n_lanes: {
    row: "start",
    text: "Three lanes, one per device: save file on this computer, save file on another device, or by hand. Starting to sync erases the device, with a backup offered every time; stopping keeps everything.",
    fill: "blue",
  },
  n_computer: {
    row: "computer",
    text: "One active half at a time: copy the folder, then drag the file in. The code area holds the code’s whole life (covered, generating, shown, paused), so the card keeps its height. “No thanks” & a wrong file create nothing. Windows key + R comes after the safe steps, with a warning.",
    fill: "blue",
  },
  n_phone: {
    row: "phone_setup",
    text: "The computer already shared a save file, so scanning shows progress at once. The iPhone question comes during setup, before syncing starts; “Sync this save file instead?” only on a device that’s already syncing & opens another computer’s code.",
    fill: "blue",
  },
  n_living: {
    row: "living",
    text: "Other devices only ever get save files, so they show the gap slip, never the computer’s pause or read errors; a save file they can’t read themselves gets the short notice. The computer reminds you to keep its tab open.",
    fill: "orange",
  },
  n_data: {
    row: "data",
    text: "Each action says what it’s for. A syncing lane hides Import & the transfer card. “Make a new code” makes the new code before retiring the old; if it can’t, the old one keeps working. Stopping keeps all progress.",
    fill: "blue",
  },
};
