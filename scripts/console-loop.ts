/**
 * The browser console, in your terminal.
 *
 * `npm run typecheck` and `npm run test` both pass against a page that
 * renders its server HTML and then does nothing at all, because neither of
 * them ever loads the page in a browser. The one place that failure is
 * written down is the browser console, and an agent cannot read it.
 *
 * This script hands it over. It starts the dev server, opens one page in
 * headless Chrome, and prints every console message, every uncaught
 * exception and every request the page failed to load. It exits non-zero
 * when the page logged an error.
 *
 *     npm run check:console                 # "/"
 *     npm run check:console -- /dashboard   # one route
 *     APP_URL=http://localhost:3000 npm run check:console -- /dashboard
 *
 * It speaks the Chrome DevTools Protocol over a WebSocket, which Node has
 * built in, so it adds no dependency. It needs a Chrome on the machine; set
 * CHROME_PATH if it cannot find yours.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const route = process.argv[2] ?? "/";
const appUrl = process.env.APP_URL ?? "http://localhost:5173";
/** How long to keep listening after `load`, for anything hydration says late. */
const SETTLE_MS = Number(process.env.SETTLE_MS ?? 2500);
/** How long to give Vite to finish pre-bundling on the throwaway first load. */
const PRIME_SETTLE_MS = Number(process.env.PRIME_SETTLE_MS ?? 2000);

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

type ConsoleLine = {
  level: string;
  /** "network" for an HTTP status, "javascript" for code that broke. */
  source: string;
  text: string;
  where: string;
};

const lines: ConsoleLine[] = [];
const children: ChildProcess[] = [];
let userDataDir: string | undefined;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findChrome(): string {
  const found = CHROME_CANDIDATES.find((path) => path && existsSync(path));
  if (!found) {
    console.error(
      "No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary."
    );
    process.exit(1);
  }
  return found;
}

/** Any HTTP answer at all means the server is up. A 401 is an answer. */
async function waitForServer(url: string, seconds: number): Promise<boolean> {
  for (let i = 0; i < seconds; i++) {
    try {
      await fetch(url);
      return true;
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

async function startDevServer(): Promise<void> {
  if (await waitForServer(appUrl, 1)) {
    console.log(`Using the server already at ${appUrl}.`);
    return;
  }

  console.log(`Starting the dev server at ${appUrl}...`);
  // Ask for the port APP_URL names. Vite moves to the next free port when
  // that one is taken, and then nothing answers here and the wait below says
  // so — which is the right complaint, because some other app has the port.
  const port = new URL(appUrl).port || "5173";
  // Its own process group: `npm run dev` is a parent of the Vite process
  // that holds the port, and killing the parent alone leaves the port held.
  const server = spawn("npm", ["run", "dev", "--", "--port", port], {
    stdio: "ignore",
    detached: true,
  });
  children.push(server);

  if (!(await waitForServer(appUrl, 60))) {
    console.error(`The dev server never answered at ${appUrl}.`);
    process.exit(1);
  }
}

/** The slices of the DevTools protocol this script reads. */
interface StackFrame {
  url?: string;
  lineNumber?: number;
}

interface ConsoleAPICalled {
  type: string;
  args: { value?: unknown }[];
  stackTrace?: { callFrames?: StackFrame[] };
}

interface ExceptionThrown {
  exceptionDetails: {
    text?: string;
    url?: string;
    lineNumber?: number;
    exception?: { description?: string };
  };
}

interface LogEntryAdded {
  entry: {
    level: string;
    source: string;
    text: string;
    url?: string;
    lineNumber?: number;
  };
}

interface LoadingFailed {
  type: string;
  errorText: string;
}

/** A CDP connection: send a command, or subscribe to an event. */
class DevToolsSession {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, (result: unknown) => void>();
  private handlers = new Map<string, ((params: unknown) => void)[]>();
  sessionId: string | undefined;

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== undefined) {
        this.pending.get(message.id)?.(message.result);
        this.pending.delete(message.id);
        return;
      }
      for (const handler of this.handlers.get(message.method) ?? []) {
        handler(message.params);
      }
    });
  }

  static async connect(endpoint: string): Promise<DevToolsSession> {
    const socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error(endpoint)), {
        once: true,
      });
    });
    return new DevToolsSession(socket);
  }

  /**
   * The protocol answers each command with a shape of its own, and this
   * script uses four of them. The caller names the shape it expects; nothing
   * here can check that claim, so keep the claim small.
   */
  send<Result>(method: string, params: object = {}): Promise<Result> {
    const id = this.nextId++;
    this.socket.send(
      JSON.stringify({ id, method, params, sessionId: this.sessionId })
    );
    return new Promise<Result>((resolve) => {
      this.pending.set(id, (result) => resolve(result as Result));
    });
  }

  on<Params>(method: string, handler: (params: Params) => void): void {
    const existing = this.handlers.get(method) ?? [];
    existing.push((params) => handler(params as Params));
    this.handlers.set(method, existing);
  }

  close(): void {
    this.socket.close();
  }
}

/** Where a message came from, as `file:line`, when Chrome says. */
function origin(url?: string, line?: number): string {
  if (!url) return "";
  const short = url.replace(appUrl, "").split("?")[0];
  return line === undefined ? short : `${short}:${line + 1}`;
}

/** Resolves on the next `load` event the page fires. */
function nextLoad(browser: DevToolsSession): Promise<void> {
  return new Promise<void>((resolve) =>
    browser.on<unknown>("Page.loadEventFired", () => resolve())
  );
}

/**
 * Load the page once, and throw the result away.
 *
 * With no `node_modules/.vite` cache — a fresh checkout, or the first load
 * after a new dependency arrives — the page asks for dependencies Vite has
 * not pre-bundled yet. Vite answers those requests with a 504 ("Outdated
 * Optimize Dep"), pre-bundles them, and pushes a full-page reload a moment
 * later. A 504 is the server's answer, so it counts as `source: "network"`
 * and never reaches the exit code: a cold first run printed the optimizer's
 * noise, found nothing from code that broke, and said green. The page's real
 * failure only showed up on the second run.
 *
 * So absorb that one-time reload here, against a throwaway load, before the
 * load this script actually reports on — the same trick
 * `.github/scripts/inspect-dashboards.sh` plays before its timed loop.
 */
async function primeOptimizer(
  browser: DevToolsSession,
  target: string
): Promise<void> {
  console.log(`Priming the dev server at ${target}...`);

  for (let attempt = 0; attempt < 3; attempt++) {
    lines.length = 0;
    const loaded = nextLoad(browser);
    await browser.send("Page.navigate", { url: target });
    await Promise.race([loaded, sleep(30000)]);
    await sleep(PRIME_SETTLE_MS);

    // Still re-optimizing: Vite is about to reload the page under us, so go
    // round again rather than measuring a page that is on its way out.
    const optimizing = lines.some((line) =>
      line.text.includes("Outdated Optimize Dep")
    );
    if (!optimizing) break;
  }

  lines.length = 0;
}

async function main() {
  await startDevServer();

  userDataDir = mkdtempSync(join(tmpdir(), "console-loop-"));
  const chrome = spawn(findChrome(), [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--remote-debugging-port=9333",
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ]);
  children.push(chrome);

  let version: { webSocketDebuggerUrl: string } | undefined;
  for (let i = 0; i < 30 && !version; i++) {
    try {
      version = await (
        await fetch("http://127.0.0.1:9333/json/version")
      ).json();
    } catch {
      await sleep(500);
    }
  }
  if (!version) {
    console.error("Chrome never opened its debugging port.");
    process.exit(1);
  }

  const browser = await DevToolsSession.connect(version.webSocketDebuggerUrl);
  const { targetId } = await browser.send<{ targetId: string }>(
    "Target.createTarget",
    { url: "about:blank" }
  );
  const { sessionId } = await browser.send<{ sessionId: string }>(
    "Target.attachToTarget",
    { targetId, flatten: true }
  );
  browser.sessionId = sessionId;

  browser.on<ConsoleAPICalled>(
    "Runtime.consoleAPICalled",
    ({ type, args, stackTrace }) => {
      const frame = stackTrace?.callFrames?.[0];
      lines.push({
        level: type,
        source: "javascript",
        text: args.map((a) => String(a.value ?? "")).join(" "),
        where: origin(frame?.url, frame?.lineNumber),
      });
    }
  );

  browser.on<ExceptionThrown>(
    "Runtime.exceptionThrown",
    ({ exceptionDetails }) => {
      lines.push({
        level: "error",
        source: "javascript",
        text:
          exceptionDetails.exception?.description ??
          exceptionDetails.text ??
          "Uncaught exception",
        where: origin(exceptionDetails.url, exceptionDetails.lineNumber),
      });
    }
  );

  browser.on<LogEntryAdded>("Log.entryAdded", ({ entry }) => {
    lines.push({
      level: entry.level,
      source: entry.source,
      text: entry.text,
      where: origin(entry.url, entry.lineNumber),
    });
  });

  browser.on<LoadingFailed>("Network.loadingFailed", ({ type, errorText }) => {
    lines.push({
      level: "error",
      source: "network",
      text: `Failed to load a ${type.toLowerCase()}: ${errorText}`,
      where: "",
    });
  });

  await browser.send("Runtime.enable");
  await browser.send("Log.enable");
  await browser.send("Network.enable");
  await browser.send("Page.enable");

  const target = new URL(route, appUrl).toString();

  await primeOptimizer(browser, target);

  console.log(`Opening ${target}\n`);

  const loaded = nextLoad(browser);
  await browser.send("Page.navigate", { url: target });
  await Promise.race([loaded, sleep(30000)]);
  await sleep(SETTLE_MS);

  browser.close();

  if (lines.length === 0) {
    console.log("The console said nothing.");
    return;
  }

  for (const line of lines) {
    const where = line.where ? `  (${line.where})` : "";
    console.log(`[${line.level}] ${line.text}${where}`);
  }

  // A network error is the server's answer, not broken code: /dashboard
  // answers 401 until you pick a user in the DevUI, every time. Print it,
  // and do not let it decide the exit code.
  const broken = lines.filter(
    (line) => line.level === "error" && line.source !== "network"
  );
  console.log(
    `\n${lines.length} message(s), ${broken.length} of them from code that broke.`
  );
  if (broken.length > 0) process.exitCode = 1;
}

function cleanUp() {
  for (const child of children) {
    if (child.pid === undefined) continue;
    try {
      // A negative pid is the process group, for the detached dev server.
      process.kill(child.spawnargs[0] === "npm" ? -child.pid : child.pid);
    } catch {
      // Already gone.
    }
  }
  try {
    // Chrome is still writing into its profile as it goes down. Losing this
    // race leaves a directory below /tmp, which is not worth a failure.
    if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    // The operating system clears /tmp.
  }
}

process.on("exit", cleanUp);
process.on("SIGINT", () => process.exit(130));

main()
  // Chrome and the dev server are still running, and Node waits for them.
  // `cleanUp` runs on the way out and kills both.
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
