import * as k from "./kit.mjs";

const {
  eyebrow,
  p,
  note,
  code,
  b,
  row,
  col,
  btn,
  steps,
  qrBand,
  matchCode,
  dropZone,
  pathCopy,
  waiting,
  dataCard,
  welcome,
  howDialog,
  tagDialog,
  fieldNote,
  tip,
  stepCard,
  options,
  secondary,
  cardLinks,
  preview,
  toast,
  homeHeader,
  pageHeader,
  indexList,
  trackerRows,
  syncLine,
  screen,
  content,
  dataPage,
  setupPage,
  section,
  howLink,
  optionCols,
  features,
  choiceCard,
  pasteField,
  textLink,
  switchLink,
  pathChoice,
  orRule,
  checkRow,
} = k;
const C = () => k.C;

// ── Home ──
const home = (
  top,
  { device = "pc", h, overlay, list = true, toolbar = true, empty = false } = {},
) =>
  screen(
    homeHeader(empty ? { right: "" } : {}) +
      content((top ?? "") + (list ? indexList({ empty }) : "")),
    {
      device,
      h,
      overlay,
      toolbar,
    },
  );
const PAIRED = { sync: {} };

// A: one general invitation; the setup page asks where.
const welcomeA = () =>
  welcome({
    overline: "New field guide",
    title: "Welcome, farmer!",
    body:
      note("Let your game save fill in your progress for you.") +
      features([
        ["file-import", "Import your progress from your save"],
        ["refresh", "Keep it up to date as you play"],
        ["device-mobile", "Sync it to your phone"],
      ]),
    foot:
      options([["Get set up", "sparkles", "About two minutes"]]) +
      secondary("I’ll check things off by hand"),
  });
const welcomePhone = (ios) =>
  welcome({
    overline: "New field guide",
    title: "Welcome, farmer!",
    body:
      note("Fill in your progress from the game save on your PC, and it keeps up as you play.") +
      howLink(),
    foot:
      options([
        [
          "Sync from my PC",
          "plug-connected",
          ios ? "3 steps · About two minutes" : "2 steps · About two minutes",
        ],
      ]) +
      secondary("I’ll check things off by hand") +
      cardLinks(["I’m on a computer →"]),
  });

// The setup page’s first question: two exclusive paths, each card one button.
const PC_PATH = pathChoice({
  icon: "device-desktop",
  title: "On this PC",
  sub: "1 step",
  body: "This tab updates from your save every time you sleep in the game.",
});
const PHONE_PATH = pathChoice({
  icon: "device-mobile",
  title: "On my phone",
  sub: "2 steps · about two minutes",
  body: "This PC sends each new save to your phone as you play.",
  extra: note("Or another computer, like a Mac.", 13) + howLink(),
});
const CHOOSE_LEAD = "Pick where you’ll check things off. You can switch later.";
const chooser = (opt = {}) =>
  screen(
    setupPage(
      "Get set up",
      CHOOSE_LEAD,
      PC_PATH + orRule() + PHONE_PATH + switchLink("I’m on a phone"),
    ),
    { h: opt.h ?? 800, toolbar: false, overlay: opt.overlay },
  );

const relayStatus = ({
  last = "9:41 pm · Summer 12, Year 2",
  status = "Applied on your Pixel 8",
  third = ["Save", "Moonberry Farm"],
  extra = "",
} = {}) =>
  welcome({
    icon: "plug-connected",
    overline: "Relay",
    title: "Sending your saves to your Pixel 8",
    body:
      note("Keep this tab open while you play. That’s it.") +
      `<div style="margin-top:8px">${dl([["Last save", last], ["Status", status], third])}</div>` +
      extra,
    foot: cardLinks(["Pairing settings"]),
  });
const browseLink = () =>
  `<button type="button" style="display:flex;align-items:center;gap:12px;min-height:44px;padding:4px 8px;background:none;border:0;color:${C().muted};font-family:Petrona,Georgia,serif;font-size:14px;cursor:pointer;text-align:left">${k.ti("book", 16)}<span style="flex:1">Browse the guide</span><span style="font-family:'IBM Plex Mono',monospace;font-size:12px">read-only</span>${k.ti("chevron-right", 16)}</button>`;
const relayHome = (card, opt = {}) =>
  screen(
    homeHeader(opt.noCounts ? { right: "" } : {}) +
      `<div style="flex:1;display:flex;flex-direction:column;justify-content:center;gap:12px;padding:16px 16px 140px">${card}${browseLink()}</div>`,
    { h: opt.h, overlay: opt.overlay },
  );
const takeover = (o) =>
  relayHome(
    welcome({
      ...o,
      tone: o.tone ?? C().amber,
      foot:
        (o.actions ?? "") +
        (o.dismiss === false ? "" : cardLinks([o.dismiss ?? "Hide this for now"])),
      actions: undefined,
    }),
  );
const noteActions = (list, tone) =>
  `<div style="position:relative;z-index:1;display:grid;grid-template-columns:${list.length > 1 ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)"};gap:8px">${list.map(([t, ic, primary], i) => `<button type="button" style="display:flex;min-height:44px;align-items:center;justify-content:center;gap:8px;padding:8px 12px;border:1px solid ${tone ?? C().amber};font-family:'Fragment Mono',monospace;font-size:12px;font-weight:600;${primary ? `color:${C().accentFg};background:${tone ?? C().amber}` : `color:${C().ink};background:${C().raised}`}">${k.ti(ic, 17)}${t}</button>`).join("")}</div>`;

const dl = (pairs) =>
  `<dl style="margin:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 14px">${pairs
    .map(
      ([t, d]) =>
        `<dt style="font-family:'Fragment Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C().muted};padding-top:4px">${t}</dt><dd style="margin:0;font-family:Petrona,Georgia,serif;font-size:14px;color:${C().ink}">${d}</dd>`,
    )
    .join("")}</dl>`;

// ── Setup page ──
const pcSetup = (title, lead, inner, opt = {}) =>
  screen(setupPage(title, lead, inner), { h: opt.h ?? 900, toolbar: false, overlay: opt.overlay });
const phoneSetup = (title, lead, inner, opt = {}) =>
  screen(setupPage(title, lead, inner), {
    device: "phone",
    h: opt.h,
    toolbar: false,
    overlay: opt.overlay,
  });
const RELAY_LEAD = "2 steps · About two minutes";
const scanIntro = p(`On your phone, open ${code("mistria.fyi/sync")} and tap “Scan the code”.`);
const covered = scanIntro + qrBand("covered", "Streaming? Keep this off screen.");
const saveBody = (zone) =>
  p("Copy this path, paste it into File Explorer’s address bar, and press Enter.") +
  pathCopy() +
  p(`Drag the newest file ending in ${code("-autosave.sav")} here.`) +
  (zone ?? dropZone({ browse: false }) + noDrag());
const noDrag = () => `<div>${textLink("Can’t drag? Import it instead", "font-size:13px")}</div>`;
const pairDone = () =>
  stepCard("i", "Pair your phone", { state: "done", summary: "Paired with your Pixel 8. Nice!" });
const pairNow = (body) => stepCard("i", "Pair your phone", { state: "current", body });
const saveTodo = () =>
  stepCard("ii", "Connect your save", { summary: "Drag the game’s save into this tab." });
const saveDone = () =>
  stepCard("ii", "Connect your save", {
    state: "done",
    summary: "Moonberry Farm · Summer 12, Year 2",
  });
const saveNow = (body) =>
  stepCard("ii", "Connect your save", { state: "current", body: body ?? saveBody() });
const chromeTip = (after = "Then paste it into Chrome or Edge.") =>
  tip({
    title: "Let Chrome do this for you",
    body: "This browser can’t keep watching a file. In Chrome or Edge, each save goes out the moment you sleep, with no dropping files.",
    action: "Copy this page’s link",
    after,
  });

const phStepPair = (state, body, summary) =>
  stepCard("i", "Pair with your PC", { state, body, summary });
const phStepSave = (state = "todo", body) =>
  stepCard("ii", "Connect your save, on your PC", {
    state,
    body,
    summary:
      state === "done" ? "Moonberry Farm · Summer 12, Year 2" : "Your PC walks you through it.",
  });
const PHONE_LEAD = "Two steps: one here, one on your PC.";
const pcOpen = p(
  `On your PC, open ${code("mistria.fyi/sync")} in Chrome or Edge, pick “On my phone”, and click “Show code”.`,
);
const scanOrPaste =
  btn("Scan the code", { icon: "camera", full: true, kind: "default" }) +
  `<div style="display:flex;justify-content:center">${textLink("Or paste a link", "font-size:13px;min-height:44px")}</div>`;

// ── Data page ──
const PC_PAIR = "Pair with Your Phone";
const PHONE_PAIR = "Pair with Your PC";
const dataSections = ({
  pair,
  pairSummary,
  pairBody,
  importSummary,
  importBody,
  relay = false,
  device = "pc",
}) =>
  relay
    ? dataPage(
        section(
          "Pairing",
          dataCard(pair, pairSummary, { open: !!pairBody, body: pairBody ?? "" }),
        ) +
          section(
            "Data",
            dataCard("Import from Save File", importSummary, {
              open: !!importBody,
              body: importBody ?? "",
            }) +
              dataCard(
                "Backup &amp; Restore",
                "Export a backup of this PC’s progress, from before it started relaying.",
              ) +
              note(
                "Restore & reset come back when you unpair, since this PC only relays for now.",
                13,
              ),
          ),
      )
    : dataPage(
        section(
          "Pairing",
          dataCard(pair, pairSummary, { open: !!pairBody, body: pairBody ?? "" }),
        ) +
          section(
            "Data",
            dataCard(
              "Import from Save File",
              importSummary ?? "Import progress from a Fields of Mistria save.",
              { open: !!importBody, body: importBody ?? "" },
            ) +
              dataCard(
                "Transfer to Another Device",
                "Move progress between devices with a QR code.",
              ) +
              dataCard("Backup &amp; Restore", "Keep a copy of your progress, or restore one.") +
              dataCard("Danger Zone", "Erase all tracked progress.", { tone: "danger" }),
          ),
      );
const pcDataPage = (o, opt = {}) =>
  screen(
    dataSections({
      pair: PC_PAIR,
      pairSummary: "Keep your phone up to date every time you play.",
      ...o,
    }),
    { h: opt.h ?? 860, toolbar: false, overlay: opt.overlay },
  );

const farmDialog = () =>
  tagDialog({
    title: "Is this the farm you’ve been tracking?",
    body: `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px">${[
      ["This save", "Applewood Farm", "Spring 3, Year 1"],
      ["Tracking now", "No farm on record", "Checked off by hand"],
    ]
      .map(
        ([t, n, d]) =>
          `<div style="border:1px dashed ${`color-mix(in srgb, ${C().tagInk} 35%, transparent)`};padding:8px 10px"><p style="margin:0 0 4px;font-family:'Fragment Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C().tagMuted}">${t}</p><p style="margin:0;font-family:Petrona,Georgia,serif;font-size:15px;font-weight:600;color:${C().tagInk}">${n}</p><p style="margin:0;font-family:'IBM Plex Mono',monospace;font-size:12px;color:${C().tagMuted}">${d}</p></div>`,
      )
      .join(
        "",
      )}</div><p style="margin:0;font-family:Satoshi,system-ui,sans-serif;font-size:13px;color:${C().tagMuted}">A new farm backs up what’s here first, then starts fresh.</p>`,
    actions: [["No, it’s a new farm"], ["Yes, same farm", true]],
  });

const pcFarmDialog = () =>
  tagDialog({
    title: "Is this the farm you’ve been tracking?",
    body: `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px">${[
      ["This save", "Moonberry Farm", "Summer 12, Year 2"],
      ["On this PC", "No farm on record", "Checked off by hand"],
    ]
      .map(
        ([t, n, d]) =>
          `<div style="border:1px dashed ${`color-mix(in srgb, ${C().tagInk} 35%, transparent)`};padding:8px 10px"><p style="margin:0 0 4px;font-family:'Fragment Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C().tagMuted}">${t}</p><p style="margin:0;font-family:Petrona,Georgia,serif;font-size:15px;font-weight:600;color:${C().tagInk}">${n}</p><p style="margin:0;font-family:'IBM Plex Mono',monospace;font-size:12px;color:${C().tagMuted}">${d}</p></div>`,
      )
      .join(
        "",
      )}</div><p style="margin:0;font-family:Satoshi,system-ui,sans-serif;font-size:13px;color:${C().tagMuted}">If it’s a different farm, this PC’s progress stays here, and your phone keeps what it has and gets the save.</p>`,
    actions: [["No, it’s a new farm"], ["Yes, same farm", true]],
  });

const PC = { w: 1280, h: 800 };
const PH = { w: 390, h: 844 };

export const rows = [
  {
    id: "first",
    title: "First look: the Home welcome card",
    boards: [
      {
        file: "Main.dc.html",
        title: "PC · Welcome: one “Get set up”",
        ...PC,
        render: () => home(welcomeA()),
      },
      {
        file: "PC-Get-Set-Up.dc.html",
        title: "PC · The setup page asks where",
        ...PC,
        render: () => chooser(),
      },
      {
        file: "PC-How.dc.html",
        title: "PC · “How it works” tag, from the phone choice",
        ...PC,
        render: () => chooser({ overlay: howDialog() }),
      },
      {
        file: "Phone-Welcome.dc.html",
        title: "Phone · Welcome (Android or the app)",
        ...PH,
        h: 900,
        render: () => home(welcomePhone(false), { device: "phone", h: 900 }),
      },
      {
        file: "Phone-Welcome-iOS.dc.html",
        title: "iPhone browser · Welcome, with the install step",
        ...PH,
        h: 900,
        render: () => home(welcomePhone(true), { device: "phone", h: 900 }),
      },
    ],
  },
  {
    id: "pc_setup",
    title: "Setup page on the PC (mistria.fyi/sync)",
    boards: [
      {
        file: "PC-Setup-Here.dc.html",
        title: "PC · On this PC (Chrome)",
        ...PC,
        h: 760,
        render: () =>
          pcSetup(
            "Connect your save",
            "One step. After this, the tracker updates every time you sleep in the game.",
            stepCard("i", "Connect your save", { state: "current", body: saveBody() }),
            { h: 760 },
          ),
      },
      {
        file: "PC-Setup-Here-Tip.dc.html",
        title: "PC · On this PC (other browsers): import, with the tip",
        ...PC,
        h: 960,
        render: () =>
          pcSetup(
            "Import your save",
            "One step. Drop your save in again whenever you want to catch up.",
            chromeTip() +
              stepCard("i", "Import your save", { state: "current", body: saveBody(dropZone()) }),
            { h: 960 },
          ),
      },
      {
        file: "PC-Setup-Move.dc.html",
        title: "PC i · This PC has progress: it rides along",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              covered +
                checkRow(
                  "Send this PC’s progress too",
                  "Sends what you’ve checked off here, once. Your phone asks before replacing anything.",
                ),
            ) + saveTodo(),
          ),
      },
      {
        file: "PC-Pair.dc.html",
        title: "PC i · Pair: code covered",
        ...PC,
        render: () => pcSetup("Set up sync", RELAY_LEAD, pairNow(covered) + saveTodo()),
      },
      {
        file: "PC-Pair-Shown.dc.html",
        title: "PC i · Code showing",
        ...PC,
        qr: true,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              scanIntro +
                qrBand("shown", "Good for 1:42") +
                `<div style="display:flex;justify-content:center;gap:8px">${btn("Hide code", { size: "sm" })}${btn("Copy link", { size: "sm", icon: "link" })}</div>` +
                note("Pairing a computer? Copy the link and open it there.", 13),
            ) + saveTodo(),
          ),
      },
      {
        file: "PC-Link-Copied.dc.html",
        title: "PC i · Link copied: the offer runs 10 minutes & the code covers itself",
        ...PC,
        qr: true,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              scanIntro +
                qrBand("covered", "Link good for 9:58") +
                `<div style="display:flex;justify-content:center;gap:8px">${btn("Copied", { size: "sm", icon: "check" })}</div>` +
                note("Pairing a computer? Copy the link and open it there.", 13),
            ) + saveTodo(),
          ),
      },
      {
        file: "PC-Match.dc.html",
        title: "PC i · Does it match?",
        ...PC,
        h: 760,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              p("Does your Pixel 8 show this code?") +
                matchCode() +
                row([btn("Yes, it matches"), btn("No, it doesn’t")]) +
                note("Haven’t scanned yet? Choose “No”.", 13),
            ) + saveTodo(),
            { h: 760 },
          ),
      },
      {
        file: "PC-Save.dc.html",
        title: "PC ii · Connect your save",
        ...PC,
        render: () => pcSetup("Set up sync", RELAY_LEAD, pairDone() + saveNow()),
      },
      {
        file: "PC-Save-Tip.dc.html",
        title: "PC ii · Other browsers: drop it after you play",
        ...PC,
        h: 1000,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            chromeTip() +
              pairDone() +
              saveNow(
                saveBody(dropZone()) +
                  note("Here, drop your save in again after each time you play.", 13),
              ),
            { h: 1000 },
          ),
      },
      {
        file: "PC-Farm-Check.dc.html",
        title: "PC ii · Save connected: is it this PC’s farm?",
        ...PC,
        render: () =>
          pcSetup("Set up sync", RELAY_LEAD, pairDone() + saveNow(), { overlay: pcFarmDialog() }),
      },
      {
        file: "PC-Sending-Progress.dc.html",
        title: "PC · Sending your progress first, then saves",
        ...PC,
        h: 760,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairDone() +
              saveDone() +
              stepCard("✱", "Sending your progress", {
                state: "current",
                body:
                  waiting("Waiting on your Pixel 8…") +
                  note(
                    "Your saves go out as soon as your phone has this. Phone in a pocket? Open the tracker there.",
                    13,
                  ) +
                  `<div>${btn("Skip it", { size: "sm" })}</div>`,
              }),
            { h: 760 },
          ),
      },
      {
        file: "PC-Skip-Refused.dc.html",
        title: "PC · “Skip it” after the phone started using it",
        ...PC,
        h: 760,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairDone() +
              saveDone() +
              stepCard("✱", "Sending your progress", {
                state: "current",
                body:
                  waiting("Waiting on your Pixel 8…") +
                  fieldNote({
                    icon: "info-circle",
                    title: "Your Pixel 8 is already using it",
                    body: "Your saves go out as soon as it’s done.",
                  }),
              }),
            { h: 760 },
          ),
      },
      {
        file: "PC-Kept-Own.dc.html",
        title: "PC · The phone kept its own progress",
        ...PC,
        h: 760,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairDone() +
              saveDone() +
              fieldNote({
                icon: "info-circle",
                title: "Your Pixel 8 kept its own progress",
                body: "So this PC’s progress stays here, and your saves go out as usual.",
              }) +
              waiting("Sending your save to your Pixel 8…"),
            { h: 760 },
          ),
      },
      {
        file: "PC-Needs-Update.dc.html",
        title: "PC · The phone needs an update before it takes it",
        ...PC,
        h: 760,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairDone() +
              saveDone() +
              stepCard("✱", "Sending your progress", {
                state: "current",
                body:
                  fieldNote({
                    tone: C().amber,
                    icon: "refresh-alert",
                    title: "Your Pixel 8 needs a tracker update",
                    body: "Open the tracker there and it’ll update itself.",
                  }) + `<div>${btn("Skip it", { size: "sm" })}</div>`,
              }),
            { h: 760 },
          ),
      },
      {
        file: "PC-Finishing-Setup.dc.html",
        title: "PC · An interrupted switch, finishing",
        ...PC,
        h: 760,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            waiting("Finishing setup…") +
              note("This page is read-only until sync confirms the pairing.", 13),
            { h: 760 },
          ),
      },
      {
        file: "PC-Fenced-Write.dc.html",
        title: "PC · Another tab’s check-off during the switch",
        ...PC,
        render: () =>
          screen(
            pageHeader("Museum", { category: "museum" }) +
              content(
                syncLine(
                  "Finishing setup… This page is read-only until sync confirms the pairing.",
                  "loader-2",
                ) +
                  trackerRows({ readOnly: true }) +
                  `<div style="position:absolute;left:16px;right:16px;bottom:72px;z-index:4">${toast("That change didn’t save: this PC is the relay now.")}</div>`,
              ),
          ),
      },
      {
        file: "PC-Progress-Stays.dc.html",
        title: "PC · A different farm: this PC’s progress stays",
        ...PC,
        h: 760,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairDone() +
              saveDone() +
              fieldNote({
                icon: "info-circle",
                title: "This PC’s progress stays here",
                body: "It’s for Applewood Farm, and you’re playing Moonberry Farm, so it stays on this PC. Your phone keeps what it has and gets the save.",
              }) +
              waiting("Sending your save to your Pixel 8…"),
            { h: 760 },
          ),
      },
      {
        file: "PC-Sending.dc.html",
        title: "PC · Sending the first save",
        ...PC,
        h: 760,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairDone() +
              stepCard("ii", "Connect your save", {
                state: "done",
                summary: "Moonberry Farm · Summer 12, Year 2",
              }) +
              waiting("Sending your save to your Pixel 8…"),
            { h: 760 },
          ),
      },
    ],
  },
  {
    id: "phone_setup",
    title: "Setup page on the phone (mistria.fyi/sync)",
    boards: [
      {
        file: "Phone-Setup-iOS.dc.html",
        title: "iPhone browser · Add to home screen, or skip",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            "Three steps: two here, one on your PC.",
            stepCard("i", "Add it to your home screen", {
              state: "current",
              body:
                steps(
                  [
                    ["a", p("Tap Share. In Safari, it may be under •••.")],
                    ["b", p("Tap “Add to Home Screen”.")],
                    ["c", p("Open the tracker from there to keep going.")],
                  ],
                  { size: 18, gap: 6 },
                ) + btn("Skip, keep using Safari", { full: true }),
            }) +
              stepCard("ii", "Pair with your PC", { summary: "Scan a code from your PC." }) +
              stepCard("iii", "Connect your save, on your PC", {
                summary: "Your PC walks you through it.",
              }),
          ),
      },
      {
        file: "Phone-Setup-iOS-Backup.dc.html",
        title: "iPhone browser · Has progress: back up before installing",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            "Three steps: two here, one on your PC.",
            stepCard("i", "Add it to your home screen", {
              state: "current",
              body:
                p("Already using the tracker here? Export a backup first.") +
                btn("Export backup", { icon: "file-download", full: true }) +
                steps(
                  [
                    ["a", p("Tap Share. In Safari, it may be under •••.")],
                    ["b", p("Tap “Add to Home Screen”.")],
                    ["c", p("Open the tracker from there, and restore the backup in Data.")],
                  ],
                  { size: 18, gap: 6 },
                ),
            }) +
              stepCard("ii", "Pair with your PC", { summary: "Scan a code from your PC." }) +
              stepCard("iii", "Connect your save, on your PC", {
                summary: "Your PC walks you through it.",
              }),
          ),
      },
      {
        file: "Phone-Setup-iOS-Skipped.dc.html",
        title: "iPhone browser · Skipped: the step folds, it doesn’t vanish",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            "Three steps: two here, one on your PC.",
            stepCard("i", "Add it to your home screen", {
              state: "skipped",
              summary: "Skipped. Add it any time.",
              body: textLink("Show me", "font-size:13px;min-height:44px"),
            }) +
              stepCard("ii", "Pair with your PC", {
                state: "current",
                body: pcOpen + scanOrPaste,
              }) +
              stepCard("iii", "Connect your save, on your PC", {
                summary: "Your PC walks you through it.",
              }),
          ),
      },
      {
        file: "Phone-Setup.dc.html",
        title: "Phone · Pair with your PC",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair("current", pcOpen + scanOrPaste) + phStepSave(),
          ),
      },
      {
        file: "Phone-Scan.dc.html",
        title: "Phone · The scanner (existing)",
        ...PH,
        render: () =>
          `<div style="position:relative;width:390px;height:844px;background:#000;display:grid;place-items:center"><div style="position:relative;width:240px;height:240px;border:2px solid rgb(255 255 255 / 50%)"></div><button type="button" aria-label="Close camera" style="position:absolute;top:12px;right:12px;width:44px;height:44px;display:grid;place-items:center;background:#eeedea;border:0;border-radius:2px;color:#2e2a22">${k.ti("x", 18)}</button></div>`,
      },
      {
        file: "Phone-Camera-Ask.dc.html",
        title: "iPhone · Code opened from the Camera (names the browser)",
        ...PH,
        render: () =>
          phoneSetup("Set up sync", PHONE_LEAD, phStepPair("current", "") + phStepSave(), {
            overlay: tagDialog({
              narrow: true,
              title: "Pair this browser, or the app?",
              desc: "Your camera opened this code in Safari. Using the tracker from your home screen? Open it there and tap “Scan the code” instead.",
              actions: [["I’ll use the app"], ["Pair Safari", true]],
            }),
          }),
      },
      {
        file: "Phone-Match.dc.html",
        title: "Phone · Check your PC",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair(
              "current",
              p("Check your PC. It should show this code:") +
                matchCode() +
                p("Confirm it there, and you’re paired.") +
                waiting("Waiting for your PC…"),
            ) + phStepSave(),
          ),
      },
      {
        file: "Phone-Paired.dc.html",
        title: "Phone · You’re paired!",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair("done", "", "Paired with your PC") +
              phStepSave(
                "current",
                fieldNote({
                  tone: C().green,
                  icon: "circle-check",
                  title: "You’re paired!",
                  body: "Now connect your save on your PC. Your progress shows up here as soon as it’s done.",
                }) + waiting("Waiting for your first save…"),
              ),
          ),
      },
      {
        file: "Phone-Has-Progress.dc.html",
        title: "Phone · Paired, with progress here & the PC’s coming",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair("done", "", "Paired with your PC") + phStepSave("current", ""),
            {
              overlay: tagDialog({
                narrow: true,
                title: "Your PC has progress to send",
                desc: "This phone has progress too. Use your PC’s, and we’ll keep a backup of what’s here. Or keep this phone’s, and your PC’s stays there.",
                body:
                  `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px">${[
                    ["From your PC", "Moonberry Farm"],
                    ["On this phone", "Moonberry Farm"],
                  ]
                    .map(
                      ([t, n]) =>
                        `<div style="border:1px dashed color-mix(in srgb, ${C().tagInk} 35%, transparent);padding:8px 10px"><p style="margin:0 0 4px;font-family:'Fragment Mono',monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${C().tagMuted}">${t}</p><p style="margin:0;font-family:Petrona,Georgia,serif;font-size:15px;font-weight:600;color:${C().tagInk}">${n}</p></div>`,
                    )
                    .join("")}</div>` +
                  `<p style="margin:0;font-family:Satoshi,system-ui,sans-serif;font-size:13px;color:${C().tagMuted}">This replaces your backup of Applewood Farm, from October 3.</p>`,
                actions: [["Keep this phone’s"], ["Use my PC’s", true]],
              }),
            },
          ),
      },
      {
        file: "Phone-Progress-Coming.dc.html",
        title: "Phone · Your PC’s progress is on its way",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair("done", "", "Paired with your PC") +
              phStepSave(
                "current",
                waiting("Your PC’s progress is on its way…") +
                  note("It comes over once your PC connects its save.", 13),
              ),
          ),
      },
      {
        file: "Phone-Paired-Progress.dc.html",
        title: "Phone · Paired, with the PC’s progress",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair("done", "", "Paired with your PC") +
              phStepSave(
                "current",
                fieldNote({
                  tone: C().green,
                  icon: "circle-check",
                  title: "You’re paired!",
                  body: "Now connect your save on your PC. Your PC’s progress comes over first, then each new save.",
                }) + waiting("Your PC’s progress is on its way…"),
              ),
          ),
      },
      {
        file: "Phone-Carry-Skipped.dc.html",
        title: "Phone · The PC didn’t send its progress",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair("done", "", "Paired with your PC") +
              phStepSave(
                "current",
                fieldNote({
                  icon: "info-circle",
                  title: "Your PC didn’t send its progress",
                  body: "This phone kept its own, and new saves still come in.",
                }) + waiting("Waiting for your first save…"),
              ),
          ),
      },
      {
        file: "Phone-Carry-Failed.dc.html",
        title: "Phone · Claimed, but couldn’t save it",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair("done", "", "Paired with your PC") +
              phStepSave(
                "current",
                fieldNote({
                  tone: C().amber,
                  icon: "alert-circle",
                  title: "Your PC’s progress couldn’t come over",
                  body: "This phone kept its own, and new saves still come in. To bring your PC’s over later, export a backup on your PC and restore it here.",
                }) + waiting("Waiting for your first save…"),
              ),
          ),
      },
      {
        file: "Phone-Link-Confirm.dc.html",
        title: "Phone · A link waits for a tap",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair(
              "current",
              p("Pair with your PC?") +
                note("Pair, then check the code on your PC.", 13) +
                btn("Pair", { kind: "default", full: true }),
            ) + phStepSave(),
          ),
      },
      {
        file: "Phone-Worked.dc.html",
        title: "Phone · It worked!",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair("done", "", "Paired with your PC") +
              phStepSave("done") +
              `<div style="height:6px"></div>` +
              fieldNote({
                tone: C().green,
                icon: "circle-check",
                title: "It worked!",
                body: "Your progress is here, and it updates every time you sleep in the game.",
                actions: [["Take a look", true]],
              }),
          ),
      },
    ],
  },
  {
    id: "desktops",
    title: "Mac & Linux: same setup, a different save folder or role",
    boards: [
      {
        file: "Mac-Get-Set-Up.dc.html",
        title: "Mac · The setup page leads with pairing",
        ...PC,
        render: () =>
          screen(
            setupPage(
              "Get set up",
              "Fields of Mistria doesn’t run on Mac, so this Mac syncs from the PC you play on.",
              pathChoice({
                icon: "device-laptop",
                title: "Sync from my PC",
                sub: "2 steps · about two minutes",
                body: "Your PC sends each new save to this Mac as you play.",
                extra: howLink(),
              }) + switchLink("The game’s on this Mac (CrossOver, Whisky)"),
            ),
            { toolbar: false },
          ),
      },
      {
        file: "Mac-Pair.dc.html",
        title: "Mac i · No camera: pair by link",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            "Two steps: one here, one on your PC.",
            stepCard("i", "Pair with your PC", {
              state: "current",
              body:
                steps(
                  [
                    [
                      "a",
                      p(
                        `On your PC, open ${code("mistria.fyi/sync")}, pick “On my phone”, click “Show code”, then “Copy link”.`,
                      ),
                    ],
                    ["b", p("Send the link to this computer, like in a message to yourself.")],
                    ["c", p("Open it here, or paste it below.")],
                  ],
                  { size: 18, gap: 6 },
                ) +
                pasteField() +
                textLink(
                  "Scan with this computer’s camera instead",
                  "font-size:13px;min-height:44px",
                ),
            }) +
              stepCard("ii", "Connect your save, on your PC", {
                summary: "Your PC walks you through it.",
              }),
          ),
      },
      {
        file: "Linux-Save.dc.html",
        title: "Linux & Steam Deck ii · Connect your save (Proton)",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairDone() +
              saveNow(
                p(
                  "Copy this path. In your file manager, press Ctrl+L, paste it, and press Enter.",
                ) +
                  pathCopy(
                    "~/.local/share/Steam/steamapps/compatdata/2142790/pfx/drive_c/users/steamuser/AppData/Local/FieldsOfMistria/saves",
                  ) +
                  note(
                    "Not there? Look in your Steam library’s steamapps/compatdata/2142790 folder.",
                    13,
                  ) +
                  note(
                    "On Steam Deck, do this in Desktop Mode. In Game Mode, saves may wait until the browser’s back in front.",
                    13,
                  ) +
                  p(`Drag the newest file ending in ${code("-autosave.sav")} here.`) +
                  dropZone({ browse: false }) +
                  noDrag(),
              ),
          ),
      },
      {
        file: "Mac-Game-Here.dc.html",
        title: "Mac ii · The game’s on this Mac (CrossOver)",
        ...PC,
        h: 900,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairDone() +
              saveNow(
                p("Copy this path. In Finder, press Shift-Command-G, paste it, and press Return.") +
                  pathCopy(
                    "~/Library/Application Support/CrossOver/Bottles/Steam/drive_c/users/crossover/AppData/Local/FieldsOfMistria/saves",
                  ) +
                  note(
                    "That’s CrossOver’s usual spot. Using something else? Look in its drive_c folder.",
                    13,
                  ) +
                  p(`Drag the newest file ending in ${code("-autosave.sav")} here.`) +
                  dropZone({ browse: false }) +
                  noDrag(),
              ),
            { h: 900 },
          ),
      },
    ],
  },
  {
    id: "hiccups",
    title: "Setup hiccups",
    boards: [
      {
        file: "PC-Code-Expired.dc.html",
        title: "PC i · The code timed out",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              scanIntro +
                fieldNote({
                  tone: C().amber,
                  icon: "clock",
                  title: "That code timed out",
                  body: "Codes last a couple of minutes. Grab a new one when your phone’s ready.",
                  actions: [["New code", true]],
                }),
            ) + saveTodo(),
          ),
      },
      {
        file: "PC-No-Match.dc.html",
        title: "PC i · “No, it doesn’t”: a fresh code",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              fieldNote({
                icon: "refresh",
                title: "No worries, nobody’s paired",
                body: "Show a new code and scan it again.",
              }) + covered,
            ) + saveTodo(),
          ),
      },
      {
        file: "Phone-Scanned-First.dc.html",
        title: "Phone · Someone else scanned first",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair(
              "current",
              fieldNote({
                tone: C().red,
                icon: "alert-triangle",
                title: "Someone else got to this code first",
                body: "On your PC, click “No, it doesn’t”, then show a new code and scan it again.",
                actions: [["Scan again", true]],
              }),
            ) + phStepSave(),
          ),
      },
      {
        file: "Phone-Start-Over.dc.html",
        title: "Phone · Took too long: start over",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair(
              "current",
              fieldNote({
                tone: C().amber,
                icon: "clock",
                title: "That took a while",
                body: "The code expired before your PC confirmed it, so nobody’s paired. Show a new code on your PC and scan it again.",
                actions: [["Scan again", true]],
              }),
            ) + phStepSave(),
          ),
      },
      {
        file: "Phone-Camera-Denied.dc.html",
        title: "Phone · Camera blocked: paste instead",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair(
              "current",
              fieldNote({
                tone: C().amber,
                icon: "camera",
                title: "We can’t use your camera",
                body: "Allow camera access in your browser’s settings, or copy the link from your PC and paste it here.",
              }) + k.pasteField(),
            ) + phStepSave(),
          ),
      },
      {
        file: "Phone-Code-Expired.dc.html",
        title: "Phone · The code or link is spent or expired",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair(
              "current",
              fieldNote({
                tone: C().amber,
                icon: "clock",
                title: "That code’s expired",
                body: "On your PC, show a new code, then scan or paste again.",
                actions: [["Scan again", true]],
              }),
            ) + phStepSave(),
          ),
      },
      {
        file: "Phone-Bad-Link.dc.html",
        title: "Phone · A link that doesn’t parse",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair(
              "current",
              fieldNote({
                tone: C().amber,
                icon: "link",
                title: "That link doesn’t look right",
                body: "It may have been cut off. Copy it again on your PC, or scan the code instead.",
              }) + scanOrPaste,
            ) + phStepSave(),
          ),
      },
      {
        file: "Phone-Offline-Setup.dc.html",
        title: "Phone · Offline during setup",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair(
              "current",
              fieldNote({
                icon: "wifi-off",
                title: "You’re offline",
                body: "Pairing needs the internet. We’ll pick up where you left off once you’re back.",
              }),
            ) + phStepSave(),
          ),
      },
      {
        file: "PC-Check-Failed.dc.html",
        title: "PC i · The robot check didn’t go through",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              fieldNote({
                tone: C().amber,
                icon: "alert-circle",
                title: "We couldn’t check you’re not a robot",
                body: "That happens sometimes. Do the quick check below, and your code shows up.",
                extra:
                  `<div style="display:flex;align-items:center;gap:10px;min-height:56px;margin-top:6px;padding:8px 12px;border:1px dashed ${C().hair};font-family:'IBM Plex Mono',monospace;font-size:12px;color:${C().muted}"><span aria-hidden="true" style="width:22px;height:22px;border:2px solid ${C().muted}"></span>Turnstile’s own check</div>` +
                  note(
                    "Still stuck? A VPN or strict privacy settings can block it. Try turning one off, or use another browser.",
                    12,
                  ),
              }),
            ) + saveTodo(),
          ),
      },
      {
        file: "PC-Too-Many-Codes.dc.html",
        title: "PC i · Too many codes for now",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              fieldNote({
                tone: C().amber,
                icon: "clock",
                title: "That’s a lot of codes",
                body: "Give it a few minutes, then show a new code.",
              }),
            ) + saveTodo(),
          ),
      },
      {
        file: "PC-Setup-Unreachable.dc.html",
        title: "PC i · Can’t reach sync, or sync is paused",
        ...PC,
        h: 860,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              fieldNote({
                tone: C().amber,
                icon: "wifi-off",
                title: "We couldn’t reach sync",
                body: "Check your connection, then try again.",
                actions: [["Try again", true]],
              }) +
                `<div style="height:6px"></div>` +
                fieldNote({
                  tone: C().hair,
                  icon: "player-pause",
                  title: "Sync is taking a break",
                  body: "We’ve paused sync for everyone while we fix something. Try again later; nothing’s lost.",
                  tilt: 0.3,
                }),
            ) + saveTodo(),
            { h: 860 },
          ),
      },
      {
        file: "PC-Relay-Link.dc.html",
        title: "Relay · A pairing link opened here",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            "",
            fieldNote({
              tone: C().amber,
              icon: "plug-connected",
              title: "This PC is the relay",
              body: "Unpair it in Data first to pair it with another device.",
              actions: [["Open Data", true]],
            }),
          ),
      },
      {
        file: "Self-No-Answer.dc.html",
        title: "Self-updating · A pairing link opened here",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            "",
            fieldNote({
              tone: C().amber,
              icon: "refresh",
              title: "This PC updates itself from your save",
              body: "Stop updating in Data first to pair it with another device.",
              actions: [["Open Data", true]],
            }),
          ),
      },
      {
        file: "Phone-Setup-Paused.dc.html",
        title: "Phone · Sync is taking a break during setup",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair(
              "current",
              fieldNote({
                tone: C().hair,
                icon: "player-pause",
                title: "Sync is taking a break",
                body: "We’ve paused sync for everyone while we fix something. Try again later; nothing’s lost.",
              }),
            ) + phStepSave(),
          ),
      },
      {
        file: "PC-Pairing-Full.dc.html",
        title: "PC i · Pairing is full today",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              fieldNote({
                icon: "clock",
                title: "Pairing is full for today",
                body: "Lots of farmers set up sync today, and we cap new pairings to keep it free. Try again tomorrow; nothing’s lost.",
              }),
            ) + saveTodo(),
          ),
      },
      {
        file: "Phone-Store-Blocked.dc.html",
        title: "Phone · Can’t pair until its progress is sorted",
        ...PH,
        render: () =>
          phoneSetup(
            "Set up sync",
            PHONE_LEAD,
            phStepPair(
              "current",
              fieldNote({
                tone: C().amber,
                icon: "alert-circle",
                title: "This phone can’t pair yet",
                body: "Its saved progress needs a look first. Open Data to sort it out, then come back.",
                actions: [["Open Data", true]],
              }),
            ) + phStepSave(),
          ),
      },
      {
        file: "PC-Wrong-File.dc.html",
        title: "PC ii · That’s not a save file",
        ...PC,
        h: 900,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairDone() +
              saveNow(
                saveBody(
                  fieldNote({
                    tone: C().red,
                    icon: "alert-triangle",
                    title: "Hmm, that’s not a save file",
                    body: "Look for one ending in -autosave.sav.",
                  }) +
                    dropZone({ error: true, browse: false }) +
                    noDrag(),
                ),
              ),
          ),
      },
    ],
  },
  {
    id: "data",
    title: "Data management, regrouped: Pairing & Data",
    boards: [
      {
        file: "PC-Data.dc.html",
        title: "PC · Data, not set up",
        ...PC,
        render: () => pcDataPage({}),
      },
      {
        file: "PC-Data-Pair.dc.html",
        title: "PC · Pair with Your Phone, opened",
        ...PC,
        h: 900,
        render: () =>
          pcDataPage(
            {
              pairBody:
                note(
                  "Pair a phone, and this tab sends it each new save while you play. Two steps, about two minutes.",
                  13,
                ) + btn("Set up pairing", { kind: "default", icon: "plug-connected" }),
            },
            { h: 900 },
          ),
      },
      {
        file: "PC-Data-Relay.dc.html",
        title: "PC · Paired: pairing & save settings",
        ...PC,
        h: 1100,
        render: () =>
          pcDataPage(
            {
              pairSummary: "Sending to your Pixel 8 · 9:41 pm",
              pairBody:
                dl([
                  ["Phone", "Pixel 8 · checked in 2 min ago"],
                  ["Last save", "9:41 pm"],
                  ["Status", "Applied on your Pixel 8"],
                ]) +
                col(
                  [btn("Pair a different phone", { full: true }), btn("Unpair", { full: true })],
                  8,
                ),
              importSummary: "Sending Moonberry Farm to your Pixel 8",
              importBody:
                dl([["Save", "Moonberry Farm · Summer 12, Year 2"]]) +
                btn("Use a different save", { full: true }),
              relay: true,
            },
            { h: 1100 },
          ),
      },
      {
        file: "PC-Data-Self.dc.html",
        title: "PC · Updating from your save (Import card)",
        ...PC,
        h: 900,
        render: () =>
          pcDataPage(
            {
              importSummary: "Updating from your save · 2 min ago",
              importBody:
                dl([
                  ["Save", "Moonberry Farm"],
                  ["Updated", "2 min ago · Summer 12, Year 2"],
                ]) +
                col(
                  [
                    btn("Use a different save", { full: true }),
                    btn("Stop updating", { full: true }),
                  ],
                  8,
                ),
            },
            { h: 900 },
          ),
      },
      {
        file: "PC-Data-Different-Save.dc.html",
        title: "PC · “Use a different save”: drag only",
        ...PC,
        h: 1100,
        render: () =>
          pcDataPage(
            {
              importSummary: "Updating from your save · 2 min ago",
              importBody:
                p(`Drag the newest file ending in ${code("-autosave.sav")} here.`) +
                pathCopy() +
                dropZone({ browse: false }) +
                noDrag() +
                btn("Cancel", { size: "sm" }),
            },
            { h: 1100 },
          ),
      },
      {
        file: "PC-Turn-Off.dc.html",
        title: "PC · Unpair?",
        ...PC,
        render: () =>
          pcDataPage(
            {
              pairSummary: "Sending to your Pixel 8 · 9:41 pm",
              importSummary: "Sending Moonberry Farm to your Pixel 8",
              relay: true,
            },
            {
              overlay: tagDialog({
                narrow: true,
                title: "Unpair your Pixel 8?",
                desc: "This tab goes back to being a regular tracker, with your progress just how you left it. Your Pixel 8 keeps everything it has.",
                actions: [["Keep syncing"], ["Unpair", true]],
              }),
            },
          ),
      },
      {
        file: "Phone-Data.dc.html",
        title: "Phone · Paired: settings",
        ...PH,
        h: 900,
        render: () =>
          screen(
            dataSections({
              pair: PHONE_PAIR,
              pairSummary: "Get each new save from your PC as you play.",
              pairBody:
                dl([
                  ["PC", "Windows"],
                  ["Last save", "9:41 pm · Summer 12"],
                ]) +
                btn("Unpair", { full: true }) +
                note("You’ll keep everything on this phone.", 12),
            }),
            { device: "phone", h: 900, toolbar: false },
          ),
      },
    ],
  },
  {
    id: "new_phone",
    title: "A new phone: back up, restore, then pair",
    boards: [
      {
        file: "PC-New-Phone.dc.html",
        title: "PC · “Pair a different phone” starts with your progress",
        ...PC,
        render: () =>
          pcDataPage(
            {
              pairSummary: "Sending to your Pixel 8 · 9:41 pm",
              importSummary: "Sending Moonberry Farm to your Pixel 8",
              relay: true,
            },
            {
              overlay: tagDialog({
                narrow: true,
                title: "New phone? Bring your progress first",
                desc: "Things you checked off by hand live on your Pixel 8, not on this PC. Back them up there and restore them on your new phone, then pair it here.",
                body: `<p style="margin:0;font-family:Satoshi,system-ui,sans-serif;font-size:13px;text-decoration:underline dotted;color:${C().tagMuted}">My old phone’s gone</p>`,
                actions: [["Never mind"], ["Show me how", true]],
              }),
            },
          ),
      },
      {
        file: "PC-New-Phone-Steps.dc.html",
        title: "PC · New phone: back up, restore, then pair",
        ...PC,
        h: 860,
        render: () =>
          pcSetup(
            "Set up your new phone",
            "3 steps · About three minutes",
            stepCard("i", "Back up your Pixel 8", {
              state: "current",
              body:
                steps(
                  [
                    [
                      "a",
                      p(
                        "On your Pixel 8, open Data, then Backup &amp; Restore, and tap “Export backup”.",
                      ),
                    ],
                    ["b", p("Send the file to your new phone, like in a message to yourself.")],
                  ],
                  { size: 18, gap: 6 },
                ) + `<div>${btn("Done, next step", { size: "sm" })}</div>`,
            }) +
              stepCard("ii", "Restore it on your new phone", {
                summary: `On your new phone, open ${code("mistria.fyi")}, go to Data, then Backup &amp; Restore, and tap “Restore from backup”.`,
              }) +
              stepCard("iii", "Pair your new phone", {
                summary: "Your Pixel 8 keeps its progress but stops getting saves.",
              }) +
              note(
                "New phone’s an iPhone? Add the tracker to your home screen first, and restore there. On iPhone, save the backup to Files.",
                13,
              ),
            { h: 860 },
          ),
      },
      {
        file: "PC-Old-Phone-Gone.dc.html",
        title: "PC i · “My old phone’s gone”: send this PC’s progress",
        ...PC,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              covered +
                checkRow(
                  "Send this PC’s progress too",
                  "This PC’s progress from before it started relaying, on October 12.",
                ),
            ) + saveTodo(),
          ),
      },
    ],
  },
  {
    id: "dash",
    title: "The relay: Home is its dashboard",
    boards: [
      {
        file: "PC-Dashboard.dc.html",
        title: "Relay · Home is the dashboard",
        ...PC,
        render: () => relayHome(relayStatus()),
      },
      {
        file: "PC-Dashboard-No-Save.dc.html",
        title: "Relay · Paired, but no save yet",
        ...PC,
        render: () =>
          relayHome(
            welcome({
              icon: "plug-connected",
              overline: "Relay",
              title: "Almost there: connect your save",
              body: note("Your Pixel 8 is paired, but there’s no save to send yet."),
              foot: noteActions([["Connect your save", "upload", true]], C().accent),
            }),
            { noCounts: true },
          ),
      },
      {
        file: "PC-Dashboard-Uploaded.dc.html",
        title: "Relay · Sent, not picked up yet",
        ...PC,
        render: () =>
          relayHome(
            relayStatus({
              last: "9:41 pm · Summer 13, Year 2",
              status: "Your Pixel 8 hasn’t picked it up yet",
              third: ["Up to date", "Summer 12, Year 2"],
            }),
          ),
      },
      {
        file: "PC-Dashboard-Progress.dc.html",
        title: "Relay · Carried progress still pending",
        ...PC,
        render: () =>
          relayHome(
            relayStatus({
              last: "9:41 pm · Summer 12, Year 2 (held)",
              status: "Waiting on your Pixel 8…",
              third: ["Sending", "This PC’s progress"],
              extra: `<div style="margin-top:10px">${btn("Skip it", { size: "sm" })}</div>`,
            }),
          ),
      },
      {
        file: "PC-Dashboard-Blocked.dc.html",
        title: "Relay · Received, but the phone’s blocked",
        ...PC,
        render: () =>
          relayHome(
            relayStatus({
              last: "9:41 pm · Summer 13, Year 2",
              status: "Your Pixel 8 needs a look in Data",
              third: ["Up to date", "Summer 12, Year 2"],
            }),
          ),
      },
      {
        file: "PC-Dashboard-Waiting.dc.html",
        title: "Relay · Delivered, waiting on a question there",
        ...PC,
        render: () =>
          relayHome(
            welcome({
              icon: "plug-connected",
              overline: "Relay",
              title: "Sending your saves to your Pixel 8",
              body:
                note("Keep this tab open while you play. That’s it.") +
                `<div style="margin-top:8px">${dl([
                  ["Last save", "9:41 pm · Summer 13, Year 2"],
                  ["Status", "On your Pixel 8, waiting on a question there"],
                  ["Up to date", "Summer 12, Year 2"],
                ])}</div>`,
              foot: cardLinks(["Pairing settings"]),
            }),
          ),
      },
      {
        file: "PC-Phone-Unpaired.dc.html",
        title: "PC · The phone unpaired: back to a tracker",
        ...PC,
        render: () =>
          home(
            fieldNote({
              icon: "info-circle",
              title: "Your Pixel 8 unpaired",
              body: "This PC is back to being a regular tracker, with your progress just how you left it.",
              actions: [["Fill in from your latest save", true]],
            }),
          ),
      },
      {
        file: "PC-Guide.dc.html",
        title: "Relay · Read-only guide & check-off toast",
        ...PC,
        render: () =>
          screen(
            pageHeader("Museum", { category: "museum" }) +
              content(
                syncLine("Read-only on the relay. From your Pixel 8’s save at 9:41 pm.", "eye") +
                  trackerRows({ readOnly: true }) +
                  `<div style="position:absolute;left:16px;right:16px;bottom:72px;z-index:4">${toast("This PC is the relay. Check things off on your Pixel 8.")}</div>`,
              ),
          ),
      },
      {
        file: "PC-Dashboard-Dark.dc.html",
        title: "Relay · Dashboard, dark",
        ...PC,
        dark: true,
        render: () => relayHome(relayStatus()),
      },
      {
        file: "PC-Dashboard-Redrop.dc.html",
        title: "Relay · Other browsers: drop after you play",
        ...PC,
        h: 1000,
        render: () =>
          relayHome(
            chromeTip() +
              welcome({
                icon: "plug-connected",
                overline: "Relay",
                title: "Done playing? Send your save.",
                body:
                  `<div style="margin-top:8px">${steps(
                    [
                      ["i", p("Sleep in the game so it saves.")],
                      ["ii", p(`Drop the newest ${code("-autosave.sav")} here.`) + dropZone()],
                    ],
                    { size: 20 },
                  )}</div>` +
                  note("Last save sent 9:41 pm yesterday.") +
                  `<div style="margin-top:6px">${dl([["Status", "Applied on your Pixel 8"]])}</div>`,
                foot: cardLinks(["Pairing settings"]),
              }),
            { h: 1000 },
          ),
      },
    ],
  },
  {
    id: "trouble",
    title: "When the relay needs you: it takes over Home",
    boards: [
      {
        file: "PC-Broken.dc.html",
        title: "Relay · Can’t read the save",
        ...PC,
        render: () =>
          takeover({
            tone: C().red,
            icon: "alert-triangle",
            overline: "Sync stopped",
            title: "We couldn’t read your latest save",
            body:
              note(
                "The game probably just updated, and the tracker needs to catch up. Your Pixel 8 has everything up to Summer 11.",
              ) +
              `<div style="margin-top:8px">${steps(
                [
                  ["i", p("Check for a tracker update.")],
                  ["ii", p("Still stuck? Send us a sync log so we can fix it.")],
                ],
                { size: 20, gap: 8 },
              )}</div>`,
            actions: noteActions(
              [
                ["Check for an update", "refresh", true],
                ["Send a sync log", "send"],
              ],
              C().red,
            ),
          }),
      },
      {
        file: "PC-Broken-Dark.dc.html",
        title: "Relay · Can’t read the save, dark",
        ...PC,
        dark: true,
        render: () =>
          takeover({
            tone: C().red,
            icon: "alert-triangle",
            overline: "Sync stopped",
            title: "We couldn’t read your latest save",
            body:
              note(
                "The game probably just updated, and the tracker needs to catch up. Your Pixel 8 has everything up to Summer 11.",
              ) +
              `<div style="margin-top:8px">${steps(
                [
                  ["i", p("Check for a tracker update.")],
                  ["ii", p("Still stuck? Send us a sync log so we can fix it.")],
                ],
                { size: 20, gap: 8 },
              )}</div>`,
            actions: noteActions(
              [
                ["Check for an update", "refresh", true],
                ["Send a sync log", "send"],
              ],
              C().red,
            ),
          }),
      },
      {
        file: "PC-Reallow.dc.html",
        title: "Relay · After a browser restart",
        ...PC,
        render: () =>
          takeover({
            icon: "plug-connected-x",
            overline: "Sync paused",
            title: "Let this tab read your save again",
            body:
              note(
                "Browsers forget file access when they restart, so this tab needs your OK again.",
              ) +
              `<div style="margin-top:8px">${steps(
                [
                  ["i", p("Click “Allow access”.")],
                  ["ii", p("Pick “Allow on every visit”, and it won’t ask again.")],
                ],
                { size: 20, gap: 8 },
              )}</div>`,
            actions: noteActions([["Allow access", "plug-connected", true]]),
            dismiss: false,
          }),
      },
      {
        file: "PC-Lapsed.dc.html",
        title: "PC · Pairing lapsed: back to a tracker",
        ...PC,
        render: () =>
          home(
            fieldNote({
              tone: C().amber,
              icon: "clock",
              title: "Your pairing with Pixel 8 expired",
              body: "Your PC and Pixel 8 haven’t synced in over three months. Pair again to pick up where you left off.",
              actions: [["Pair again", true], ["Fill in from your latest save"]],
            }),
          ),
      },
      {
        file: "PC-Paused.dc.html",
        title: "Relay · Sync is taking a break (nothing to do)",
        ...PC,
        render: () =>
          takeover({
            tone: C().hair,
            icon: "player-pause",
            overline: "Sync paused",
            title: "Sync is taking a break",
            body: note(
              "We’ve paused it for everyone while we fix something. Nothing’s lost, and you can still check things off by hand on your Pixel 8.",
            ),
            dismiss: "Got it",
          }),
      },
      {
        file: "PC-Notices.dc.html",
        title: "Relay · Smaller notices, as field notes",
        ...PC,
        h: 1500,
        render: () =>
          screen(
            homeHeader() +
              content(
                relayStatus() +
                  `<div style="display:flex;flex-direction:column;gap:18px;margin-top:10px">${[
                    fieldNote({
                      tone: C().amber,
                      icon: "alert-circle",
                      title: "Your save file moved",
                      body: "It was renamed, moved, or deleted, so we lost track of it. Drag the newest one here again.",
                      extra: col(
                        [pathCopy(), dropZone({ browse: false }), noDrag()],
                        8,
                        "margin-top:8px",
                      ),
                    }),
                    fieldNote({
                      tone: C().amber,
                      icon: "clock",
                      title: "No word from your Pixel 8 since October 12",
                      body: "Your latest save waits here until it’s back. Open the tracker there to catch up.",
                      tilt: 0.3,
                    }),
                    fieldNote({
                      icon: "info-circle",
                      title: "Another tab’s already the relay",
                      body: "Only one tab at a time can send saves. You can close this one.",
                      tilt: 0.3,
                    }),
                    fieldNote({
                      icon: "clock",
                      title: "Waiting for the internet",
                      body: "Your latest save goes out as soon as this PC is back online.",
                    }),
                    fieldNote({
                      tone: C().amber,
                      icon: "alert-circle",
                      title: "That’s a lot of saves for one day!",
                      body: "Your Pixel 8 has everything up to Summer 30, and sync picks back up tomorrow.",
                      tilt: 0.3,
                    }),
                    fieldNote({
                      icon: "clock",
                      title: "Sync’s full for today",
                      body: "Your latest save goes out tomorrow, when sync resets. Nothing’s lost.",
                    }),
                    fieldNote({
                      tone: C().amber,
                      icon: "refresh-alert",
                      title: "Your Pixel 8 needs a tracker update",
                      body: "Open the tracker there and it’ll update itself.",
                    }),
                  ].join("")}</div>`,
              ),
            { h: 1500 },
          ),
      },
    ],
  },
  {
    id: "phone",
    title: "Living with it on the phone: status lives in the toolbar",
    boards: [
      {
        file: "Phone-Home.dc.html",
        title: "Phone · All good: a quiet sync button",
        ...PH,
        render: () => home("", { device: "phone", toolbar: PAIRED }),
      },
      {
        file: "Phone-Sync-Panel.dc.html",
        title: "Phone · Sync button opened",
        ...PH,
        render: () =>
          home("", {
            device: "phone",
            toolbar: {
              sync: {},
              panel: [
                ["From your PC", "5 min ago"],
                ["Last save", "Summer 12, Year 2"],
              ],
            },
          }),
      },
      {
        file: "Phone-Long-Gap.dc.html",
        title: "Phone · No saves in a while",
        ...PH,
        render: () =>
          home("", {
            device: "phone",
            toolbar: {
              sync: { tone: C().amber, slip: "No saves in 5 days", status: "no saves in a while" },
            },
          }),
      },
      {
        file: "Phone-Paused.dc.html",
        title: "Phone · Sync is taking a break",
        ...PH,
        render: () =>
          home("", {
            device: "phone",
            toolbar: { sync: { tone: C().hair, slip: "Sync’s taking a break", status: "paused" } },
          }),
      },
      {
        file: "Phone-Waiting-Save.dc.html",
        title: "Phone · Paired, waiting for a first save",
        ...PH,
        render: () =>
          home("", {
            device: "phone",
            toolbar: {
              sync: {
                tone: C().hair,
                slip: "Waiting for your first save",
                status: "waiting for your first save",
              },
            },
          }),
      },
      {
        file: "Phone-Question-Waiting.dc.html",
        title: "Phone · A question’s waiting",
        ...PH,
        render: () =>
          home("", {
            device: "phone",
            toolbar: {
              sync: {
                tone: C().amber,
                slip: "A question’s waiting",
                status: "a question’s waiting",
              },
            },
          }),
      },
      {
        file: "Phone-Unpaired.dc.html",
        title: "Phone · The PC unpaired",
        ...PH,
        render: () =>
          home(
            fieldNote({
              icon: "info-circle",
              title: "Your PC unpaired this phone",
              body: "Everything here stays. Pair again any time from Data.",
            }),
            { device: "phone" },
          ),
      },
      {
        file: "Phone-Lapsed.dc.html",
        title: "Phone · Pairing expired",
        ...PH,
        render: () =>
          home(
            fieldNote({
              tone: C().amber,
              icon: "clock",
              title: "Your pairing expired",
              body: "Your PC and this phone haven’t synced in over three months. Pair again to keep going.",
              actions: [["Pair again", true]],
            }),
            { device: "phone", toolbar: { sync: { tone: C().amber } } },
          ),
      },
      {
        file: "Phone-Update-PC.dc.html",
        title: "Phone · The PC is behind",
        ...PH,
        render: () =>
          home(
            fieldNote({
              tone: C().amber,
              icon: "refresh-alert",
              title: "Update the tracker on your PC",
              body: "Reload the sync tab there, and you’re good.",
            }),
            { device: "phone", toolbar: { sync: { tone: C().amber } } },
          ),
      },
      {
        file: "Phone-Update-Self.dc.html",
        title: "Phone · This phone is behind",
        ...PH,
        render: () =>
          home(
            fieldNote({
              tone: C().amber,
              icon: "refresh-alert",
              title: "Update this phone",
              body: "Your PC is on a newer tracker. Close and reopen the tracker here to update it.",
            }),
            { device: "phone", toolbar: { sync: { tone: C().amber } } },
          ),
      },
      {
        file: "Phone-Farm-Switched.dc.html",
        title: "Phone · Used the PC’s progress: the old is backed up",
        ...PH,
        render: () =>
          home(
            fieldNote({
              tone: C().green,
              icon: "circle-check",
              title: "Your PC’s progress is here",
              body: "We kept a backup of this phone’s progress for Applewood Farm. Restore it any time from Data.",
            }),
            { device: "phone", toolbar: PAIRED },
          ),
      },
      {
        file: "Phone-Blocked.dc.html",
        title: "Phone · Blocked after pairing: saves wait",
        ...PH,
        render: () =>
          home(
            fieldNote({
              tone: C().amber,
              icon: "alert-circle",
              title: "New saves are waiting",
              body: "This phone’s saved progress needs a look before they can come in. Open Data to sort it out.",
              actions: [["Open Data", true]],
            }),
            { device: "phone", toolbar: { sync: { tone: C().amber } } },
          ),
      },
      {
        file: "Phone-Replaced.dc.html",
        title: "Phone · Replaced by another device",
        ...PH,
        render: () =>
          home(
            fieldNote({
              icon: "info-circle",
              title: "Your PC paired with another device",
              body: "This phone keeps its progress but won’t get new saves.",
              actions: [["Pair this phone again"]],
            }),
            { device: "phone" },
          ),
      },
      {
        file: "Phone-Switched.dc.html",
        title: "Phone · A new farm: switched, with a backup",
        ...PH,
        render: () =>
          home(
            fieldNote({
              tone: C().green,
              icon: "circle-check",
              title: "Switched to Applewood Farm",
              body: "We saved a backup of Moonberry Farm. Restore it any time from Data.",
            }),
            { device: "phone", toolbar: PAIRED },
          ),
      },
      {
        file: "Phone-Restore-Replace.dc.html",
        title: "Phone · Restoring onto progress asks first",
        ...PH,
        render: () =>
          screen(
            dataSections({
              pair: PHONE_PAIR,
              pairSummary: "Get each new save from your PC as you play.",
            }),
            {
              device: "phone",
              toolbar: false,
              overlay: tagDialog({
                narrow: true,
                title: "Replace what’s on this phone?",
                desc: "We’ll keep a backup of what’s here first.",
                body: `<p style="margin:0;font-family:Satoshi,system-ui,sans-serif;font-size:13px;color:${C().tagMuted}">This replaces your backup of Applewood Farm, from October 3.</p>`,
                actions: [["Never mind"], ["Replace", true]],
              }),
            },
          ),
      },
      {
        file: "Phone-Same-Farm.dc.html",
        title: "Phone · A first save onto progress with no farm on record",
        ...PH,
        render: () => home("", { device: "phone", toolbar: PAIRED, overlay: farmDialog() }),
      },
      {
        file: "Phone-Home-Dark.dc.html",
        title: "Phone · No saves in a while, dark",
        ...PH,
        dark: true,
        render: () =>
          home("", {
            device: "phone",
            toolbar: { sync: { tone: C().amber, slip: "No saves in 5 days" } },
          }),
      },
    ],
  },
  {
    id: "iphone",
    title: "Moving to the iPhone app",
    boards: [
      {
        file: "iPhone-App-Welcome.dc.html",
        title: "iPhone app · First launch leads with sync (empty)",
        ...PH,
        h: 900,
        render: () =>
          home(
            welcome({
              overline: "New field guide",
              title: "Welcome, farmer!",
              body:
                note(
                  "Fill in your progress from the game save on your PC, and it keeps up as you play.",
                ) + howLink(),
              foot:
                options([["Sync from my PC", "plug-connected", "2 steps · About two minutes"]]) +
                secondary("I’ll check things off by hand") +
                cardLinks(["Used the tracker in your browser? Bring it over →"]),
            }),
            { device: "phone", h: 900, empty: true },
          ),
      },
      {
        file: "iPhone-App-Move.dc.html",
        title: "iPhone app · Bring your progress over, by backup",
        ...PH,
        render: () =>
          phoneSetup(
            "Bring your progress over",
            "Two quick steps, then pair.",
            stepCard("i", "Back up in your browser", {
              state: "current",
              body: steps(
                [
                  [
                    "a",
                    p(
                      `In the browser you used, open ${code("mistria.fyi")}, go to Data, then Backup &amp; Restore, and tap “Export backup”.`,
                    ),
                  ],
                  ["b", p("Save it to Files, then come back here.")],
                ],
                { size: 18, gap: 6 },
              ),
            }) +
              stepCard("ii", "Restore it here", {
                summary:
                  "Go to Data, then Backup &amp; Restore, tap “Restore from backup”, and pick the file.",
              }) +
              stepCard("iii", "Pair with your PC again", {
                summary: "Pairings stay with each copy.",
              }),
          ),
      },
      {
        file: "PC-Match-Replace.dc.html",
        title: "PC i · Pairing the app replaces the browser’s pairing",
        ...PC,
        h: 760,
        render: () =>
          pcSetup(
            "Set up sync",
            RELAY_LEAD,
            pairNow(
              p("Does your iPhone show this code?") +
                matchCode("730 158") +
                note(
                  "This replaces the pairing with Safari on iPhone, which keeps what it has but stops getting saves.",
                  13,
                ) +
                row([btn("Yes, it matches"), btn("No, it doesn’t")]) +
                note("Haven’t scanned yet? Choose “No”.", 13),
            ) + saveTodo(),
            { h: 760 },
          ),
      },
      {
        file: "Phone-Replaced-iOS.dc.html",
        title: "iPhone browser · After the move to the app",
        ...PH,
        render: () =>
          home(
            fieldNote({
              icon: "info-circle",
              title: "Your PC paired with another device",
              body: "This browser keeps its progress but won’t get new saves. Moved to the home screen app? You’re all set.",
            }) +
              `<div style="display:flex;justify-content:center">${textLink("Pair this browser again", "font-size:13px;min-height:44px")}</div>`,
            { device: "phone" },
          ),
      },
    ],
  },
  {
    id: "self",
    title: "Self-updating tracker (#252)",
    boards: [
      {
        file: "Self-Home.dc.html",
        title: "Self-updating · Sync button opened",
        ...PC,
        render: () =>
          home("", {
            toolbar: {
              sync: {},
              panel: [
                ["From your save", "2 min ago"],
                ["Save", "Moonberry Farm"],
              ],
            },
          }),
      },
      {
        file: "Self-Reallow.dc.html",
        title: "Self-updating · After a browser restart",
        ...PC,
        render: () =>
          home(
            fieldNote({
              tone: C().amber,
              icon: "plug-connected-x",
              title: "Let this tab read your save again",
              body: "Browsers forget file access when they restart. Click “Allow access”, then pick “Allow on every visit”, and it won’t ask again.",
              actions: [["Allow access", true]],
            }),
            { toolbar: { sync: { tone: C().amber } } },
          ),
      },
      {
        file: "Self-Broken.dc.html",
        title: "Self-updating · Can’t read the save",
        ...PC,
        render: () =>
          home(
            fieldNote({
              tone: C().red,
              icon: "alert-triangle",
              title: "We couldn’t read your latest save",
              body: "The game probably just updated. Your progress here is from Summer 11 until the tracker catches up.",
              actions: [["Check for an update", true], ["Send a sync log"]],
            }),
            { toolbar: { sync: { tone: C().red } } },
          ),
      },
      {
        file: "Self-New-Farm.dc.html",
        title: "Self-updating · Progress with no farm on record",
        ...PC,
        render: () => home("", { toolbar: PAIRED, overlay: farmDialog() }),
      },
    ],
  },
];

export const notes = {
  n_first: {
    row: "first",
    text: "A PC gets “Get set up” & a phone gets “Sync from my PC”; on a PC, mistria.fyi/sync then asks where, as two exclusive paths. “How it works” sits with the phone path it explains. “By hand” dismisses the card, as today. The redesign drops WelcomeCard’s corner ring (until #10 settles marginalia) and its accent wash.",
    fill: "green",
  },
  n_desk: {
    row: "desktops",
    text: "Plan: the platform (from the user agent) changes only the save folder and the default role; the switch link overrides it. Linux & Steam Deck play through Proton, so they get the PC flow with the Proton path. The game has no Mac build, so a Mac pairs like a phone, by link instead of a camera. App ID 2142790 is confirmed (steamdb.info/app/2142790). To verify in #130: the Proton & CrossOver paths, & Steam Deck’s browser.",
    fill: "blue",
  },
  n_link: {
    row: "desktops",
    text: "“Copy link” hands over the same offer URL the QR holds, so a computer opens it like the iPhone Camera path. Copying it extends the offer to 10 minutes, and the match code still guards it. Steam Deck: Desktop Mode; SD-card & Flatpak paths get a fallback line (#130 verifies).",
    fill: "blue",
  },
  n_pc: {
    row: "pc_setup",
    text: "When the PC has progress, it sends it once over the sync channel after the save is connected, only for the farm the save names. The phone takes it whole or keeps its own; nothing merges.",
    fill: "blue",
  },
  n_phone: {
    row: "phone_setup",
    text: "An empty phone takes the PC’s progress without asking. A phone with progress asks right after pairing: use the PC’s (backing up its own) or keep its own.",
    fill: "blue",
  },
  n_new: {
    row: "new_phone",
    text: "Manual check-offs live on the old phone, not the relay, so a new phone starts with backup & restore; a new phone is usually empty, & restore asks before replacing anything it holds. A handoff code is deferred to #269.",
    fill: "green",
  },
  n_data: {
    row: "data",
    text: "Shown once sync ships; “Transfer to Another Device” stays until #138 removes it. Pairing keeps a phone up to date; Backup & Restore keeps a copy & moves progress to a new device. The relay’s save lives in the Import card, not the pairing.",
    fill: "blue",
  },
  n_tone: {
    row: "trouble",
    text: "Tone: amber needs you, red is an error, green is good news, and hairline is just so you know (nothing to do).",
    fill: "orange",
  },
};
