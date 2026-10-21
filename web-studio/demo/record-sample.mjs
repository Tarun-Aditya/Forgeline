// Records the "build a feature with Forgeline" demo: a small task app (GraphQL server + React web) before the
// feature, then Forgeline taking the request from idea to merge (a replay of a real job), then the app after.
// Run it through demo/run-sample-demo.sh.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "./.pw/node_modules/playwright-core/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.DEMO_URL ?? "http://127.0.0.1:3111";
const REPO = process.env.DEMO_REPO ?? "/tmp/fl-replay-repo";
const OUT = process.env.DEMO_OUT ?? path.join(HERE, "out");
const SIZE = { width: 1440, height: 810 };
const CHROME = process.env.CHROME_BIN ?? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => fs.existsSync(p));
const APP_BEFORE = process.env.APP_BEFORE ?? "http://localhost:5174";
const APP_AFTER = process.env.APP_AFTER ?? "http://localhost:5173";
const WT_URL = process.env.WT_URL ?? "http://127.0.0.1:3222/walkthrough/index.html";
const TASK = "Add a priority (low, medium or high) to tasks. The GraphQL API should accept it when adding a task and return it on every task, and the web app should let the user pick it when adding a task and show it as a badge on each task. Default is medium.";

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: OUT, size: SIZE }, colorScheme: "dark" });
const page = await context.newPage();
const T0 = Date.now(); // the video starts with the page
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---- on-screen furniture: cursor, click ripple, captions, title cards -------------------------
await page.addInitScript(() => {
  const css = `
  #__cursor{position:fixed;z-index:99999;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(255,255,255,.92);box-shadow:0 0 0 2px rgba(0,0,0,.55),0 2px 10px rgba(0,0,0,.5);pointer-events:none;opacity:0;transition:opacity .2s}
  .__ripple{position:fixed;z-index:99998;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #3ddc9e;pointer-events:none;animation:__rp .6s ease-out forwards}
  @keyframes __rp{to{transform:scale(4);opacity:0}}
  #__cap{position:fixed;z-index:99997;left:50%;bottom:22px;transform:translateX(-50%);max-width:min(940px,92vw);min-width:420px;pointer-events:none;padding:14px 22px 16px 20px;border-radius:16px;background:rgba(10,16,13,.97);color:#f1f6f3;font:500 17px/1.4 var(--font-body,system-ui);box-shadow:0 14px 48px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.14);display:none;text-align:left;overflow:hidden;--ac:#3ddc9e}
  #__cap.top{top:12px;bottom:auto}
  #__cap.action{--ac:#ff7ab8}
  #__cap::before{content:"";position:absolute;left:0;top:0;bottom:0;width:6px;background:var(--ac)}
  #__cap b{display:flex;align-items:center;gap:10px;font-size:13px;letter-spacing:.09em;text-transform:uppercase;margin-bottom:5px;color:var(--ac)}
  #__cap b em{font-style:normal;background:var(--ac);color:#06100b;border-radius:999px;padding:2px 9px;font-size:11px;letter-spacing:.06em}
  #__cap span{display:block;color:#dbe6e0}
  #__cap i{position:absolute;left:0;bottom:0;height:3px;width:100%;background:var(--ac);transform-origin:left;transform:scaleX(0);opacity:.9}
  #__cap.show{display:block;animation:__pop .5s cubic-bezier(.2,1.5,.35,1) both}
  #__cap.show i{animation:__bar var(--dur,4s) linear forwards}
  #__cap.out{display:block;animation:__out .22s ease-in forwards}
  #__cap.action.show{animation:__pop .5s cubic-bezier(.2,1.5,.35,1) both,__pulse 1.4s .5s ease-in-out infinite}
  @keyframes __pop{0%{opacity:0;transform:translateX(-50%) translateY(34px) scale(.86)}60%{opacity:1;transform:translateX(-50%) translateY(-5px) scale(1.035)}100%{opacity:1;transform:translateX(-50%) translateY(0) scale(1)}}
  @keyframes __out{to{opacity:0;transform:translateX(-50%) translateY(18px) scale(.94)}}
  @keyframes __bar{to{transform:scaleX(1)}}
  @keyframes __pulse{50%{box-shadow:0 14px 48px rgba(0,0,0,.6),inset 0 0 0 2px var(--ac),0 0 34px rgba(255,122,184,.5)}}
  #__fade{position:fixed;inset:0;z-index:99996;background:#070c0a;opacity:0;pointer-events:none;transition:opacity .2s ease}
  #__title.out{animation:__tout .45s ease forwards}
  @keyframes __tout{to{opacity:0}}
  #__title{position:fixed;inset:0;pointer-events:none;z-index:100000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:radial-gradient(900px 520px at 50% 38%,#133326 0%,#0b1511 55%,#070c0a 100%);color:#eef5f1;font:var(--font-body,system-ui);text-align:center;padding:56px;overflow:hidden}
  #__title::before{content:"";position:absolute;inset:-20%;background:conic-gradient(from 210deg at 50% 50%,rgba(61,220,158,.0),rgba(61,220,158,.16),rgba(255,122,184,.12),rgba(61,220,158,0));filter:blur(70px);animation:__spin 14s linear infinite}
  #__title>*{position:relative;animation:__rise .7s cubic-bezier(.2,.9,.3,1) both}
  #__title em{font-style:normal;font:600 14px/1 var(--font-body,system-ui);letter-spacing:.22em;text-transform:uppercase;color:#3ddc9e;border:1px solid rgba(61,220,158,.5);border-radius:999px;padding:8px 16px;background:rgba(61,220,158,.08)}
  #__title h1{margin:0;font:700 66px/1.05 var(--font-display,system-ui);letter-spacing:-.03em;max-width:1100px;background:linear-gradient(180deg,#fff,#b5cfc3);-webkit-background-clip:text;background-clip:text;color:transparent;animation-delay:.08s}
  #__title p{margin:0;font:400 25px/1.45 var(--font-body,system-ui);color:#a9bdb3;max-width:900px;animation-delay:.18s}
  @keyframes __rise{from{opacity:0;transform:translateY(22px) scale(.97)}to{opacity:1;transform:none}}
  @keyframes __spin{to{transform:rotate(360deg)}}
  `;
  const mount = () => {
    if (document.getElementById("__cursor")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    for (const [id, tag] of [["__fade", "div"], ["__cursor", "div"], ["__cap", "div"], ["__title", "div"]]) {
      const el = document.createElement(tag);
      el.id = id;
      document.body.appendChild(el);
    }
    const cur = document.getElementById("__cursor");
    addEventListener("mousemove", (e) => { cur.style.opacity = "1"; cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
  };
  addEventListener("DOMContentLoaded", mount);
  window.__cap = (kind, title, text, n, dur) => {
    mount();
    const el = document.getElementById("__cap");
    if (!title) { if (el.classList.contains("show")) { el.classList.remove("show"); el.classList.add("out"); } return; }
    el.className = kind;
    el.style.setProperty("--dur", (dur || 4000) + "ms");
    el.innerHTML = `<b>${n ? `<em>${String(n).padStart(2, "0")}</em>` : ""}${title}</b><span>${text ?? ""}</span><i></i>`;
    void el.offsetWidth;
    el.classList.add("show");
  };
  window.__title = (h, p, eyebrow) => {
    mount();
    const el = document.getElementById("__title");
    if (!h) { el.classList.add("out"); setTimeout(() => { el.style.display = "none"; el.innerHTML = ""; el.classList.remove("out"); }, 460); return; }
    el.classList.remove("out");
    el.innerHTML = `${eyebrow ? `<em>${eyebrow}</em>` : ""}<h1>${h}</h1><p>${p ?? ""}</p>`;
    el.style.display = "flex";
  };
  window.__fade = (on) => { mount(); document.getElementById("__fade").style.opacity = on ? ".94" : "0"; };
  window.__ripple = (x, y) => {
    const r = document.createElement("div");
    r.className = "__ripple";
    r.style.left = x + "px"; r.style.top = y + "px";
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 700);
  };
});

const hold = (ms) => page.waitForTimeout(ms);
// ---- voice-over: each caption and title card is spoken by Piper (offline), then muxed by mux-vo.py ----
const VO_PY = process.env.VO_PY, VO_MODEL = process.env.VO_MODEL;
const VO_DIR = path.join(OUT, "vo");
const voEvents = [];
let voBusyUntil = 0, step = 0;
function speak(text) {
  if (!VO_PY || !VO_MODEL) return null;
  const clean = text.replace(/<[^>]+>/g, "").replace(/[ \t]+/g, " ").trim();
  const file = path.join(VO_DIR, createHash("sha1").update(clean).digest("hex").slice(0, 12) + ".wav");
  fs.mkdirSync(VO_DIR, { recursive: true });
  if (!fs.existsSync(file)) execFileSync("python3", [path.join(HERE, "tts.py"), VO_MODEL, file], { input: clean, env: process.env, stdio: ["pipe", "ignore", "inherit"] });
  const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()) * 1000;
  return { file, dur };
}
// Wait for the previous line to finish, then start this one; returns when it is on screen.
async function say(text) {
  const v = speak(text);
  const wait = voBusyUntil - Date.now();
  if (wait > 0) await hold(wait);
  if (v) {
    // Sync flash: a magenta square in the corner of the video marks the frame where this line starts, so the
    // muxer can place the audio on the video's own timeline (the recording runs slower than the wall clock).
    await page.evaluate(() => {
      let el = document.getElementById("__sync");
      if (!el) { el = document.createElement("div"); el.id = "__sync"; el.style.cssText = "position:fixed;left:0;top:0;width:12px;height:12px;background:#f0f;z-index:2147483647;display:none;pointer-events:none"; document.documentElement.appendChild(el); }
      el.style.display = "block"; setTimeout(() => { el.style.display = "none"; }, 600);
    });
    voEvents.push({ at: Date.now() - T0 + 120, file: v.file, ms: v.dur }); voBusyUntil = Date.now() + v.dur + 200; }
  return v;
}
// Let the current narration line finish (plus a beat) before the next action.
const finish0 = async (extra = 300) => {
  const w = voBusyUntil - Date.now();
  if (w > 0) await hold(w);
  await hold(extra);
};
// `vo` is the spoken line; without it the title and text are read.
const cap = async (title, text, vo, kind = "info") => {
  if (!title) return page.evaluate(() => window.__cap());
  const v = await say(vo ?? title + ". " + (text ?? ""));
  await page.evaluate(() => window.__cap());      // old caption leaves with its own exit animation
  await hold(140);                                // a short gap so two captions never read as one
  step += 1;
  log("cap", step, title);
  await page.evaluate(([k, t, x, n, d]) => window.__cap(k, t, x, n, d), [kind, title, text, step, v ? v.dur : 4000]);
};
const capTop = (title, text, vo) => cap(title, text, vo, "info top");
const card = async (h, p, vo, eyebrow) => {
  if (h) await say(vo ?? h + ". " + (p ?? ""));
  await page.evaluate(([a, b, c]) => window.__title(a, b, c), [h, p, eyebrow]);
  if (!h) await hold(450);
};
const agentTile = (name) => page.getByRole("button", { name: new RegExp(name) }).first();

async function glide(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box for locator");
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 28 });
  await hold(250);
  await page.evaluate(([a, b]) => window.__ripple(a, b), [x, y]);
  return locator;
}
const click0 = async (locator) => { await glide(locator); await locator.click(); };
// Navigation dips through a quick fade instead of cutting: the cursor arrives, the screen eases down,
// the page changes underneath, and it eases back up.
const nav0 = async (name) => {
  const btn = page.getByRole("button", { name: new RegExp("^" + name) }).first();
  await glide(btn);
  await page.evaluate(() => window.__fade(1));
  await hold(190);
  await btn.click();
  await hold(120);
  await page.evaluate(() => window.__fade(0));
  await hold(260);
};
const jobs = () => page.evaluate(async (r) => (await (await fetch("/api/jobs?repo=" + encodeURIComponent(r))).json()).jobs ?? [], REPO);
const runs = () => page.evaluate(async () => (await (await fetch("/api/runs")).json()).runs ?? []);

async function until(label, test, timeout = 240000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await test()) return;
    await hold(400);
  }
  throw new Error("timed out waiting for " + label);
}
const stageIs = (...stages) => async () => stages.includes((await jobs()).at(-1)?.stage);
const runDone = async () => { const r = await runs(); return r.length > 0 && r.every((x) => x.status !== "running"); };

async function selectJob0() {
  await nav("Board");
  const chip = page.getByRole("tab", { name: /001/ });
  if ((await chip.getAttribute("aria-selected")) !== "true") await click(chip);
  await hold(600);
}
async function viewFiles0(pickName) {
  await click(page.getByRole("button", { name: "View files and activity" }));
  await hold(1200);
  if (pickName) await click(page.getByRole("dialog").getByRole("button", { name: pickName }).first());
}
const closeDialog0 = async () => {
  // Escape, then make sure the dialog really is gone (retry with its close button) so the next click is never blocked.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Escape");
    await hold(500);
    if ((await page.getByRole("dialog").count()) === 0) return;
    const x = page.getByRole("dialog").getByRole("button", { name: /close/i }).first();
    if (await x.count()) await x.click().catch(() => {});
    await hold(400);
  }
};



// Timing: say which action was slow, so a stall in a recording can be found in the log.
const timed = (name, fn) => async (...a) => {
  const t = Date.now();
  try { return await fn(...a); } finally {
    const secs = (Date.now() - t) / 1000;
    if (secs > 8) log("SLOW", name, secs.toFixed(1) + "s", String(a[0] ?? "").slice(0, 50));
  }
};
const click = timed("click", click0), nav = timed("nav", nav0), selectJob = timed("selectJob", selectJob0),
  viewFiles = timed("viewFiles", viewFiles0), closeDialog = timed("closeDialog", closeDialog0), finish = timed("finish", finish0);
// ---- the demo ------------------------------------------------------------------------------
// The sample app is narrow, so make it bigger on screen. Pages of the app get a larger root size.
const bigApp = () => page.addStyleTag({ content: "main{zoom:1.45} body{background:#f6f7f9}" });
const visit = async (url, zoom) => {
  await page.evaluate(() => window.__fade(1));
  await hold(220);
  await page.goto(url);
  if (zoom) await bigApp();
  await hold(150);
  await page.evaluate(() => window.__fade(0));
  await hold(350);
};
const addTask = async (title, priority) => {
  const box = page.getByLabel("New task");
  await glide(box);
  await box.click();
  await box.pressSequentially(title, { delay: 45 });
  if (priority) {
    const sel = page.getByLabel("Priority");
    await glide(sel);
    await sel.selectOption(priority);
    await hold(500);
  }
  await click(page.getByRole("button", { name: "Add", exact: true }));
  await hold(900);
};

try {
  await page.goto(BASE);
  await hold(800);

  // ============ The feature ============
  await card("Add task priority", "One small feature. A GraphQL API, a React app, and Forgeline in between.",
    "Let's build a small feature, from request to merge.\n\nA task app. A GraphQL API behind it, and a React front end.\nAnd Forgeline doing the work.", "Demo");
  await finish(250);
  await card();
  await visit(APP_BEFORE, true);
  await cap("Before", "A task app. Tasks have a title and a done flag. That's all.",
    "This is the app today.\n\nA list of tasks. You can add one, tick it off, filter it, delete it.\nBut you can't say which task matters most.");
  await finish(200);
  const first = page.getByRole("checkbox").first();
  await glide(first);
  await hold(400);
  await addTask("Write the launch notes");
  await cap("The feature", "Every task gets a priority: low, medium or high.",
    "So here's the feature.\n\nEvery task gets a priority. Low, medium, or high.");
  await finish(200);
  await card("What we expect", "API: addTask takes a priority, every task returns one, medium by default, bad values rejected.  Web: a picker on the form, a badge on every task.",
    "On the server, the GraphQL mutation takes an optional priority.\nEvery task returns one. The default is medium. And a made-up value is rejected.\n\nOn the web, the form gets a priority picker, and every task shows a badge.",
    "Expected behaviour");
  await finish(300);
  await card();

  // ============ Forgeline: a quick tour ============
  await visit(BASE);
  await cap("Forgeline", "A web layer over the factory, running on your machine.",
    "Now, over to Forgeline.\n\nBefore we build anything, a quick look around.\nThis is the Forgeline web app. It runs on your machine, and the sidebar on the left is the map.");
  await finish(200);
  await nav("Board");
  await cap("Board", "Every job is a card, moving left to right.",
    "The Board is home. Every job is a card, and it moves from intent, all the way to merged.\nA pink dot means it's waiting on you.");
  await finish(200);
  await nav("New job");
  await cap("New job", "A sentence, a ticket key, or a bug report.",
    "New job is where you ask for work.\nA sentence, a ticket key, or a bug report. That's all it takes.");
  await finish(200);
  await nav("Agents");
  await cap("Agents", "The team, laid out as a pipeline.",
    "Agents is the team. Fourteen specialists, laid out as a pipeline, from intake, to review, to the final decision.");
  await finish(200);
  await nav("Activity");
  await cap("Activity", "Every tool call, from every agent, live.",
    "Activity is a live feed of everything the agents do.");
  await finish(200);
  await nav("Runs");
  await cap("Runs", "Replay any run. Or resume it in Claude Code.",
    "Runs keeps every run, so you can replay one, or pick it up in Claude Code.");
  await finish(200);
  await nav("Metrics");
  await cap("Metrics", "Cost, tokens, and how often the first try is good enough.",
    "And Metrics shows what it cost, and how often the first attempt was good enough.");
  await finish(300);
  await card("Now, let's build the feature", "Add task priority. Step by step, with Forgeline.",
    "That's the lay of the land.\n\nNow let's build our feature with Forgeline, and walk through the journey, one step at a time.", "Let's build");
  await finish(300);
  await card();

  // ============ Step 1: describe it ============
  await nav("New job");
  await capTop("Step 1 · Describe it", "Start at New job. Plain English.",
    "Step one. We start at New job, in the sidebar.\nI describe the feature in plain words, the same way I did a minute ago.");
  await finish(100);
  const task = page.getByLabel("Task");
  await glide(task);
  await task.click();
  await task.fill(TASK);
  await hold(600);
  await click(page.getByRole("button", { name: "Send", exact: true }));
  await capTop("The factory starts", "An agent restates it and lists what it assumed.",
    "I hit send.\n\nAn agent reads the request, restates it in its own words, and writes down what it had to guess.");
  await until("intent stage", stageIs("intent"));
  await until("first run to finish", runDone);
  await finish(300);

  // ============ Step 2: accept the intent ============
  await selectJob();
  await cap("Step 2 · Your first call", "Board → open the card → read the intent → Accept.",
    "Step two. Back on the Board, the job is now a card, and it's waiting on me.\nI click the card, and a panel opens. View files shows what the agent wrote.\n\nHere's the intent, with the assumptions marked. It's right, so I accept. That's my first call.", "action");
  await viewFiles();
  await finish(300);
  await closeDialog();
  await click(page.getByRole("button", { name: "Accept intent", exact: true }));
  await hold(800);

  // ============ Step 3: approve the spec ============
  await nav("Agents");
  await cap("Step 3 · The spec", "The Agents page shows who is working.",
    "Step three. On the Agents page, the intent writer is done, and the spec writer's tile is live.\nIt reads the real code in the repo, and writes criteria a test can check.");
  await until("spec-approval", stageIs("spec-approval"));
  await finish(200);
  await selectJob();
  await cap("Step 3 · Your second call", "Board → open the card → read the spec → Approve.",
    "Again the card is waiting on me. I open it, and read the spec.\nThe design, the interfaces, the acceptance criteria, and a risk level.\nIt's low risk. Additive, with no migration.\n\nI approve it. That's my second call, and then I can step back.", "action");
  await viewFiles("spec.md");
  await finish(300);
  await closeDialog();
  await click(page.getByRole("button", { name: "Approve spec", exact: true }));
  await hold(800);

  // ============ Step 4: the factory works (the long wait, filled with a tour) ============
  await nav("Agents");
  await cap("Step 4 · Plan, build, review", "Automatic. Each tile lights up as its stage begins.",
    "Step four is automatic. A planner, then a builder, then four reviewers, then an approver.\nI just watch the Agents page, where each tile lights up as its stage begins.\nThis part takes a while, so let's use the time to look at the team.");
  await finish(200);
  const gate = stageIs("needs-human", "merged");
  const fillers = [
    async () => {
      await nav("Activity");
      await cap("Activity · live", "Every tool call, as it happens.",
        "Meanwhile, Activity fills up. Every file read, every command, every test run, as it happens.\nSame as the terminal. Nothing hidden.");
      await finish(200);
    },
    async () => {
      await nav("Agents");
      await click(page.getByRole("tab", { name: "All jobs" }));
      await hold(300);
      await cap("The team", "Fourteen agents. One job each.",
        "Back on Agents. Fourteen agents, and each one has exactly one job.\nFive stages across the top, and two support groups underneath.");
      await finish(200);
      await click(agentTile("intent-writer"));
      await cap("intent-writer", "Turns a raw idea into a clear intent.",
        "Click any agent, and you see its model, its tools, and its full prompt.\nThe intent writer turns a rough idea into a clear one. And the prompt is just a markdown file. Read it. Change it.");
      await finish(200);
      await click(agentTile("planner"));
      await cap("planner", "Reads the real code, then plans.",
        "The planner reads the real code before it plans, and lists the files, the tests, and the rollback.");
      await finish(150);
      await click(agentTile("builder"));
      await cap("builder", "The only agent with edit access.",
        "The builder is the only agent with the edit tool.\nIt works on its own branch, and runs the tests as it goes.");
      await finish(150);
      await click(agentTile("reviewer-security"));
      await cap("Reviewers", "Read-only. Nobody grades their own work.",
        "The four reviewers are read-only, so nobody grades their own work.\nSecurity, user experience, interface design, and code.");
      await finish(150);
      await click(agentTile("approver"));
      await cap("approver", "The final gate. It writes down why.",
        "And the approver is the final gate. It decides to merge, or to hand it to a person, and writes down why.");
      await finish(150);
      await click(agentTile("scanner-security"));
      await cap("Maintain loop", "Scanners find. A diagnoser explains.",
        "Underneath, scanners watch the codebase on a schedule, and try to disprove their own findings.\nA diagnoser explains what drifted. They report. They never change anything.");
      await finish(200);
    },
    async () => {
      await click(page.getByLabel("Search agents"));
      await page.getByLabel("Search agents").pressSequentially("review", { delay: 90 });
      await cap("Search · Table view", "Find any agent. Compare them side by side.",
        "Search finds any agent in a keystroke, and the table view lines them up side by side, with model and tools.");
      await hold(500);
      await click(page.getByRole("button", { name: "Table view" }));
      await finish(300);
      await page.getByLabel("Search agents").fill("");
      await click(page.getByRole("button", { name: "Pipeline view" }));
      await hold(300);
    },
    async () => {
      await nav("Runs");
      await cap("Runs · live", "This run is still going.",
        "On Runs, this run is still going. Click any run, and you can replay its log, or copy the command that resumes it in Claude Code.");
      await hold(500);
      await click(page.getByRole("button", { name: /approve-spec/ }).first());
      await finish(500);
      await closeDialog();
    },
    async () => {
      await until("plan", stageIs("build", "review", "approve", "needs-human", "merged"));
      await selectJob();
      await cap("The plan", "Files, order of work, tests, rollback.",
        "The planner has finished. Back on the Board, I open the card, and View files has the plan.\nWhich files change, in what order, which test proves each criterion, and how to roll it back.");
      await viewFiles("plan.md");
      await finish(300);
      await closeDialog();
    },
    async () => {
      await until("review", stageIs("review", "approve", "needs-human", "merged"));
      await nav("Agents");
      await cap("Review", "Four reviewers, in parallel.",
        "The builder is done, and the four reviewers are checking the branch at the same time.");
      await finish(200);
      await until("review files", stageIs("approve", "needs-human", "merged"));
      await selectJob();
      await cap("A review, up close", "Findings. Evidence. A verdict.",
        "Each review is a plain document, with the checks it ran, the findings, and a verdict.");
      await viewFiles("review-code");
      await finish(300);
      await closeDialog();
    },
    async () => {
      await nav("Agents");
      await cap("Approve", "The approver re-runs everything itself.",
        "Now the approver. It doesn't trust the reviews. It re-runs lint and both test suites, and tries to break the change.\nThis is the slowest step, and it should be.");
      await finish(200);
    },
    async () => {
      await nav("Activity");
      await cap("Activity · the approver", "Real commands, real output.",
        "Back on Activity, you can watch the approver's own commands go by, and the merge gate at the very end.");
      await finish(200);
    },
  ];
  for (const f of fillers) {
    if (await gate()) break;
    await f();
  }
  await until("gate", gate, 300000);
  await until("run to finish", runDone, 120000);

  // ============ Step 5: the third call ============
  await selectJob();
  await cap("Step 5 · Your third call", "The approver said yes. The merge gate wants a person.",
    "Step five. The approver said yes. But the merge gate re-ran the tests on a clean copy of main first.\nThe web tests were already failing there, because of this machine's environment setting.\nSo it can't prove the change is safe, and it hands the decision to me.\n\nThat's the gate doing its job. The tests pass with the right setting, so I merge.", "action");
  await viewFiles("decision");
  await finish(300);
  await closeDialog();
  page.once("dialog", (d) => d.accept()); // the button asks "Merge into main?"
  await click(page.getByRole("button", { name: "Approve merge", exact: true }));
  await hold(800);
  await until("merged", stageIs("merged"), 120000);
  await until("last run to finish", runDone, 120000);
  await nav("Board");
  await hold(500);
  await cap("Merged", "Tests passed. Landed on main.",
    "Merged.\n\nThe merge gate landed it on main. The agents never merge on their own.");
  await finish(300);
  await nav("Runs");
  await cap("The record", "Four runs. Every one kept.",
    "And everything is kept. Four runs, each one replayable, with what it cost.");
  await finish(300);
  await nav("Metrics");
  await page.mouse.move(700, 150, { steps: 20 });
  await cap("Metrics · the scorecard", "Jobs merged. First-pass rate. Escalations. Cost.",
    "And Metrics is the scorecard.\n\nAcross the top: jobs merged, how many are in flight, and how many needed a person.\nThe first-pass rate, which is how often the reviewers accepted the first attempt. The escalation rate. And what this job cost, with its runs and tokens.\nOn a subscription login, that cost is the API-equivalent, not a bill.");
  await finish(600);
  await page.mouse.move(700, 520, { steps: 30 });
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 90); await hold(120); }
  await cap("Cost by day · by model · by job", "Which models did the work, and what it cost.",
    "Scroll down, and the cost is broken out by day, by model, and by job.\nYou can see which models did the work, how many tokens went in and out, and how much was served from cache.\n\nThat's how a team sees, over time, what the factory costs and how well it's working.");
  await finish(1200);

  // ============ After ============
  await cap();
  await visit(APP_AFTER, true);
  await cap("After", "The same app, with priority.",
    "And here's the app after.\n\nThe tasks that were already there now show a medium badge.\nThe form has a priority picker, set to medium.");
  await finish(200);
  await addTask("Ship the demo", "HIGH");
  await cap("Backend, GraphQL and web", "A high badge, from the API to the screen.",
    "I add a task, and pick high.\nThe web app sends it through GraphQL, the server stores it, and it comes back with its badge.");
  await finish(200);
  await addTask("Water the plants", "LOW");
  await cap("Low, medium, high", "Three values. Three colours. The text always says which.",
    "Low, medium, and high. Different colours, and the word is always there too.");
  await finish(300);

  // ============ The code walkthrough ============
  await cap();
  await card("Now, the code", "What Forgeline actually wrote, and how it is organised.",
    "Now, the part you'll care about most. The code.\\n\\nLet's open the change in an editor, and see what Forgeline actually wrote, how it's organised, and why that matters.",
    "Under the hood");
  await finish(300);
  await card();
  await page.evaluate(() => window.__fade(1));
  await hold(220);
  await page.goto(WT_URL);
  await page.waitForFunction(() => window.__wtReady, null, { timeout: 30000 });
  await page.evaluate(() => window.__fade(0));
  await hold(500);
  const file = (p) => page.locator(`[data-path="${p}"]`);
  const openFile = async (p) => {
    await click(file(p));
    await page.evaluate((q) => window.__wt.open(q), p);
    await hold(700);
  };
  const tour = async (n, ms = 2600) => {
    for (let i = 0; i < n; i++) { await page.evaluate((k) => window.__wt.reveal(k), i); await hold(ms); }
  };
  await capTop("The change set", "Nine code files in two packages, and the record beside them.",
    "This is the change, as the factory left it. On the left, nine code files in two packages: the server, then the web app. Below them, the record the factory wrote along the way.\\nNotice the order. It's told contract first, then each side's code, then its tests.");
  await glide(file("server/src/store.ts"));
  await finish(300);

  await openFile("server/src/store.ts");
  await capTop("server · store.ts", "One place decides the default.",
    "First, the store. A priority type, and one place that decides the default.\\nBecause the store says medium, the tasks that already existed, and any added without a priority, all come out medium. Five lines, and old data just works.");
  await tour(1, 2000);
  await finish(300);

  await openFile("server/src/schema.ts");
  await capTop("server · schema.ts", "The contract: an enum, a field, an optional argument.",
    "Next, the GraphQL schema. This is the contract, and everything else follows from it.\\nA new enum. A priority field on every task. And an optional argument on the add mutation, defaulting to medium.\\nBecause it's an enum, GraphQL rejects any other value before our code even runs. So there's no hand-written validation to get wrong.");
  await tour(3, 3200);
  await finish(300);

  await openFile("server/src/schema.test.ts");
  await capTop("server · schema.test.ts", "Every rule in the spec is a test.",
    "Then the server tests. Thirty new lines, one for each rule in the spec.\\nEach priority round-trips. The default is medium. Existing tasks are medium. And a made-up value is rejected, and adds nothing.");
  await tour(2, 3000);
  await finish(300);

  await openFile("web/src/graphql.ts");
  await capTop("web · graphql.ts", "The web queries change with the schema.",
    "Now the web side. The queries ask for the priority, and the add mutation sends it.\\nThe schema and these queries changed together. The project's AGENTS file says they must, and the agents followed it.");
  await tour(2, 2600);
  await finish(300);

  await openFile("web/src/App.tsx");
  await capTop("web · App.tsx", "One line passes the choice through.",
    "In the app, one line. The chosen priority is passed through to the mutation.");
  await tour(1, 1800);
  await finish(200);

  await openFile("web/src/AddTaskForm.tsx");
  await capTop("web · AddTaskForm.tsx", "The picker. Medium by default.",
    "The form gets the priority picker. Medium is preselected, and it resets to medium after every add, so each new task starts from the default.");
  await tour(2, 2800);
  await finish(300);

  await openFile("web/src/TaskItem.tsx");
  await capTop("web · TaskItem.tsx", "One line shows the badge.",
    "And one line shows the badge, on every task, done or not.");
  await tour(1, 1800);
  await finish(200);

  await openFile("web/src/styles.css");
  await capTop("web · styles.css", "Colour helps. The word says it.",
    "The colours. Five lines. The word is always on the badge, so colour is a hint, never the message. And the spec asked for readable contrast.");
  await tour(1, 2200);
  await finish(300);

  await openFile("web/src/components.test.tsx");
  await capTop("web · components.test.tsx", "The picker and the badge are tested.",
    "And the web tests. The picker's options and default, submitting with a chosen priority, and the badge itself.");
  await tour(2, 2600);
  await finish(300);

  await capTop("Why it's organised this way", "Small, in the project's own patterns, and each part tested.",
    "Look at the shape of it. Small. In the project's own patterns, with its own naming. The server and the web move together. And every rule has a test beside it.\\nThat's what makes a change like this reviewable in minutes.");
  await finish(300);

  await openFile("docs/adr/0001-task-priority.md");
  await capTop("The record · ADR", "The decision, saved where the team will look.",
    "Then the record. The design decision is saved as an architecture record in the docs, so a year from now, anyone can find out why it was built this way.");
  await tour(1, 2400);
  await finish(300);

  await openFile("factory/audit/001-task-priority/spec.md");
  await capTop("The record · spec.md", "Design, rejected alternatives, acceptance criteria.",
    "The spec has the design, the alternatives it rejected, and the acceptance criteria.");
  await tour(1, 2200);
  await finish(200);

  await openFile("factory/audit/001-task-priority/plan.md");
  await capTop("The record · plan.md", "Files, order of work, tests, rollback.",
    "The plan names the files, the order of work, which test proves each criterion, and how to roll it back.");
  await tour(1, 2200);
  await finish(200);

  await openFile("factory/audit/001-task-priority/decision.md");
  await capTop("The record · decision.md", "The approver's reasoning, with evidence.",
    "And the approver's decision, with the evidence for each criterion. It re-ran the tests, and tried to break it.");
  await tour(1, 2200);
  await finish(300);

  await page.evaluate(() => document.getElementById("side").scrollTo({ top: 9999, behavior: "smooth" }));
  await hold(900);
  await capTop("The history", "Server commit. Web commit. One commit per stage. One merge.",
    "And the history is clean. The server change is one commit, and the web change is another. Each stage of the process left a commit of its own, so you can see how the change was built.\\nThe whole thing reached main through the gate, in a single merge.");
  await finish(1200);

  await cap();
  await card("Request. Approve. Merge.", "A feature across server, GraphQL and web, reviewed and tested before it landed on main.",
    "One request. Three decisions from me.\nA feature across the server, the GraphQL schema, and the web app, reviewed and tested before it reached main.\n\nForgeline.", "Forgeline");
  await finish(2200);
  log("demo finished");
} catch (e) {
  log("FAILED", e.message);
  await page.screenshot({ path: path.join(OUT, "failure.png") });
  process.exitCode = 1;
} finally {
  const video = page.video();
  await context.close();
  const file = await video.path();
  fs.renameSync(file, path.join(OUT, "forgeline-sample-demo.webm"));
  fs.writeFileSync(path.join(OUT, "vo.json"), JSON.stringify(voEvents, null, 1));
  await browser.close();
  log("saved", path.join(OUT, "forgeline-sample-demo.webm"));
}
