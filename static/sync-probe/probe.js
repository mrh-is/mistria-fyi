// Hardware probe for save-driven sync (#130). It makes no network requests: the save is read only
// to log its size, modification time, & a short SHA-256 prefix, and the log stays in localStorage.
// Served verbatim from static/, outside the TypeScript project, & built on File System Access APIs
// that TypeScript's DOM types lack, so the type-aware rules see every value as untyped.
/* oxlint-disable typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return */

const LOG_KEY = "sync-probe-log";
const LOG_LIMIT = 500;
const POLL_MS = 10_000;
const QUIET_MS = 15_000;

const $ = (id) => document.querySelector(`#${id}`);
const on = (id, type, handler) => {
  $(id).addEventListener(type, (event) => void handler(event));
};

// `navigator.standalone` is how an iPhone home screen app says so.
const context =
  matchMedia("(display-mode: standalone), (display-mode: window-controls-overlay)").matches ||
  navigator.standalone === true
    ? "app"
    : "tab";

function browserName() {
  const brand = navigator.userAgentData?.brands.find(
    (entry) => !/chromium|not.a.brand/i.test(entry.brand),
  );
  if (brand) return `${brand.brand} ${brand.version}`;
  for (const [name, pattern] of [
    ["Firefox", /Firefox\/(\d+)/],
    ["Edge", /Edg[A]?\/(\d+)/],
    ["Chrome", /Chrome\/(\d+)/],
    ["Safari", /Version\/(\d+).*Safari/],
  ]) {
    const match = pattern.exec(navigator.userAgent);
    if (match) return `${name} ${match[1]}`;
  }
  return "unknown browser";
}

const browser = browserName();
const features = {
  "drop handles": "getAsFileSystemHandle" in DataTransferItem.prototype,
  "file picker": "showOpenFilePicker" in globalThis,
  FileSystemObserver: "FileSystemObserver" in globalThis,
};

// Farm numbers & slot numbers are identifying, and the report goes into a public issue.
const redact = (name) => name.replaceAll(/\d{3,}/g, "#");
const timestamp = () => new Date().toLocaleString("sv-SE");

function readLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function log(message) {
  const lines = [...readLog(), `${timestamp()} [${context}, ${browser}] ${message}`].slice(
    -LOG_LIMIT,
  );
  localStorage.setItem(LOG_KEY, JSON.stringify(lines));
  render();
}

function setStatus(message) {
  $("status").textContent = message;
}

// IndexedDB holds the file handle, the only store that can.
function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("sync-probe", 1);
    request.addEventListener("upgradeneeded", () => request.result.createObjectStore("handles"));
    request.addEventListener("success", () => {
      resolve(request.result);
    });
    request.addEventListener("error", () => {
      reject(new Error("IndexedDB request failed", { cause: request.error }));
    });
  });
}

async function store(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction("handles", mode).objectStore("handles"));
    request.addEventListener("success", () => {
      resolve(request.result);
    });
    request.addEventListener("error", () => {
      reject(new Error("IndexedDB request failed", { cause: request.error }));
    });
  });
}

const saveHandle = (handle) => store("readwrite", (handles) => handles.put(handle, "save"));
const loadHandle = () => store("readonly", (handles) => handles.get("save"));
const deleteHandle = () => store("readwrite", (handles) => handles.delete("save"));

let handle;
let heldFile;
let observer;
let pollTimer;
let lastSeen;
let lastObserverEvent = 0;
let lastPollError;
let rereadTimer;

async function describe(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hash = [...new Uint8Array(digest).slice(0, 4)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${redact(file.name)}, ${file.size} bytes, modified ${new Date(file.lastModified).toLocaleString("sv-SE")}, sha ${hash}`;
}

const failure = (error) => `${error?.name ?? "Error"}: ${error?.message ?? error}`;

async function readHandle(reason) {
  try {
    const file = await handle.getFile();
    lastSeen = `${file.lastModified}:${file.size}`;
    log(`${reason}: read ok, ${await describe(file)}`);
  } catch (error) {
    log(`${reason}: read failed, ${failure(error)}`);
  }
}

function stopWatching() {
  observer?.disconnect();
  observer = undefined;
  clearInterval(pollTimer);
}

async function startWatching() {
  stopWatching();
  if (features.FileSystemObserver) {
    observer = new FileSystemObserver((records) => {
      lastObserverEvent = Date.now();
      for (const record of records) {
        const moved = record.relativePathMovedFrom
          ? `, moved from ${redact(record.relativePathMovedFrom.join("/"))}`
          : "";
        const changed = record.changedHandle ? `, handle ${redact(record.changedHandle.name)}` : "";
        log(`observer event: ${record.type}${changed}${moved}`);
      }
      clearTimeout(rereadTimer);
      rereadTimer = setTimeout(() => void readHandle("after observer event"), 500);
    });
    try {
      await observer.observe(handle);
      log("observer started");
    } catch (error) {
      log(`observer failed to start, ${failure(error)}`);
    }
  } else {
    log("no FileSystemObserver; polling only");
  }
  // Polling catches changes the observer misses, such as a replaced file.
  pollTimer = setInterval(() => void poll(), POLL_MS);
  setStatus("Watching the save. Leave this open while the game saves.");
}

async function poll() {
  try {
    const file = await handle.getFile();
    lastPollError = undefined;
    const seen = `${file.lastModified}:${file.size}`;
    if (seen === lastSeen) return;
    lastSeen = seen;
    const quiet = Date.now() - lastObserverEvent > QUIET_MS;
    log(
      `poll saw a change${quiet ? " with NO observer event in the last 15 s" : ""}: ${await describe(file)}`,
    );
  } catch (error) {
    const message = failure(error);
    if (message !== lastPollError) log(`poll read failed, ${message}`);
    lastPollError = message;
  }
}

async function adoptHandle(newHandle, how) {
  handle = newHandle;
  heldFile = undefined;
  try {
    await saveHandle(handle);
    log(`${how}: got a file handle for ${redact(handle.name)}, stored in IndexedDB`);
  } catch (error) {
    log(`${how}: got a handle but could not store it, ${failure(error)}`);
  }
  await readHandle("first read");
  await startWatching();
}

async function adoptFile(file, how) {
  stopWatching();
  handle = undefined;
  heldFile = file;
  log(`${how}: got a File only (no handle), ${await describe(file)}`);
  setStatus("Holding a File snapshot only. Use “Read again now” after the game saves.");
}

const drop = $("drop");
drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => {
  drop.classList.remove("over");
});
on("drop", "drop", async (event) => {
  event.preventDefault();
  drop.classList.remove("over");
  const [item] = event.dataTransfer.items;
  if (!item) return;
  // Both must be called before the event handler yields.
  const pendingHandle = item.getAsFileSystemHandle?.();
  const file = item.getAsFile();
  try {
    const dropped = await pendingHandle;
    if (dropped?.kind === "file") {
      await adoptHandle(dropped, "dropped");
      return;
    }
    if (dropped) log(`dropped a ${dropped.kind}, not a file`);
  } catch (error) {
    log(`drop handle failed, ${failure(error)}`);
  }
  if (file) await adoptFile(file, "dropped");
});

// A file copied in File Explorer & pasted here is the one keyboard path that might yield a handle.
async function handlePaste(event) {
  if (event.target instanceof HTMLInputElement) return;
  const item = [...event.clipboardData.items].find((entry) => entry.kind === "file");
  if (!item) {
    log("pasted: no file on the clipboard");
    return;
  }
  event.preventDefault();
  // Both must be called before the event handler yields, as with a drop.
  const pendingHandle = item.getAsFileSystemHandle?.();
  const file = item.getAsFile();
  try {
    const pasted = await pendingHandle;
    if (pasted?.kind === "file") {
      await adoptHandle(pasted, "pasted");
      return;
    }
    log(pasted ? `pasted a ${pasted.kind}, not a file` : "pasted: no handle offered");
  } catch (error) {
    log(`paste handle failed, ${failure(error)}`);
  }
  if (file) await adoptFile(file, "pasted");
}
document.addEventListener("paste", (event) => void handlePaste(event));

on("pick", "click", async () => {
  if (!features["file picker"]) return $("file-input").click();
  try {
    const [picked] = await showOpenFilePicker({ id: "mistria-save" });
    await adoptHandle(picked, "picked");
  } catch (error) {
    log(`file picker refused or cancelled, ${failure(error)}`);
  }
});

on("file-input", "change", async (event) => {
  const [file] = event.target.files;
  if (file) await adoptFile(file, "picked (file input)");
});

on("grant", "click", async () => {
  if (!handle) {
    log("ask for permission: no stored handle");
    return;
  }
  try {
    const result = await handle.requestPermission({ mode: "read" });
    log(`asked for permission: ${result}`);
    if (result === "granted") {
      await readHandle("read after permission");
      await startWatching();
    }
  } catch (error) {
    log(`asking for permission failed, ${failure(error)}`);
  }
});

on("reread", "click", async () => {
  if (handle) return readHandle("manual read");
  if (!heldFile) {
    log("manual read: nothing held");
    return;
  }
  try {
    log(`manual read of held File: read ok, ${await describe(heldFile)}`);
  } catch (error) {
    log(`manual read of held File: read failed, ${failure(error)}`);
  }
});

on("forget", "click", async () => {
  stopWatching();
  handle = undefined;
  heldFile = undefined;
  await deleteHandle();
  log("forgot the stored handle");
  setStatus("No save held.");
});

const randomId = () =>
  [...crypto.getRandomValues(new Uint8Array(6))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

on("scan-link", "click", () => {
  const scan = randomId();
  const url = `${location.origin}/sync-probe/?scan=${scan}#offer=${randomId()}${randomId()}`;
  $("scan-url").href = url;
  $("scan-url").textContent = url;
  log(`made scan link ${scan}`);
});

on("add-note", "click", () => {
  const note = $("note").value.trim();
  if (note) log(`note: ${note}`);
  $("note").value = "";
});

on("copy", "click", async () => {
  const text = $("report").value;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Report copied.");
  } catch {
    $("report").select();
    setStatus("Copying failed; the report is selected, so copy it by hand.");
  }
});

$("clear").addEventListener("click", () => {
  localStorage.removeItem(LOG_KEY);
  render();
});

document.addEventListener("visibilitychange", () => {
  log(`page ${document.visibilityState}`);
});

function render() {
  const header = [
    "Sync probe report (#130)",
    `Page: ${location.origin}${location.pathname}, opened in ${context === "app" ? "installed app" : "browser tab"}`,
    `Browser: ${browser}, platform ${navigator.userAgentData?.platform ?? navigator.platform}`,
    `User agent: ${navigator.userAgent}`,
    `Features: ${Object.entries(features)
      .map(([name, present]) => `${name} ${present ? "yes" : "no"}`)
      .join(", ")}`,
    "Log:",
  ];
  $("report").value = ["```", ...header, ...readLog(), "```"].join("\n");
}

async function start() {
  const query = new URLSearchParams(location.search);
  if (query.has("scan")) {
    const fragment =
      location.hash.length > 1 ? `present, ${location.hash.length - 1} chars` : "MISSING";
    log(
      `opened from scan link ${query.get("scan")}: fragment ${fragment}, referrer ${document.referrer || "none"}`,
    );
    // The PC keeps the link in its address bar, so the browser's “Create QR code” includes it.
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
      history.replaceState(null, "", location.pathname);
      log("stripped the scan link from the address");
    }
  } else {
    log("page opened");
  }

  if (!features["drop handles"] && !features["file picker"]) {
    setStatus("This browser gives no file handles: drop or pick the save each time.");
    return;
  }
  try {
    handle = await loadHandle();
  } catch (error) {
    log(`could not read IndexedDB, ${failure(error)}`);
  }
  if (!handle) {
    setStatus("No save held. Drag your save onto the box below.");
    return;
  }
  const permission = await handle.queryPermission({ mode: "read" });
  log(`stored handle for ${redact(handle.name)}, permission on load: ${permission}`);
  if (permission === "granted") {
    await readHandle("read on load");
    await startWatching();
  } else {
    setStatus("Stored save found. Click “Ask for permission”.");
  }
}

render();
await start();
