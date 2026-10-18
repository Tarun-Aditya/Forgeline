// Records a demo video of the web app with Playwright: every page, one job from request to merge,
// the Agents view changing at each stage, what each stage produces and the two approvals the human
// gives. Run it through demo/run-demo.sh, which starts the app against a replayed job.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "./.pw/node_modules/playwright-core/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.DEMO_URL ?? "http://127.0.0.1:3111";
const REPO = process.env.DEMO_REPO ?? "/tmp/forgeline-demo-repo";
const OUT = process.env.DEMO_OUT ?? path.join(HERE, "out");
const SIZE = { width: 1440, height: 810 };
const CHROME = process.env.CHROME_BIN ?? ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => fs.existsSync(p));
const TASK = "Add a function slugify(text) to textkit.py that lowercases the text, replaces runs of non-alphanumeric characters with a single hyphen and strips leading and trailing hyphens. Add unit tests.";

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
const finish = async (extra = 300) => {
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
const click = async (locator) => { await glide(locator); await locator.click(); };
// Navigation dips through a quick fade instead of cutting: the cursor arrives, the screen eases down,
// the page changes underneath, and it eases back up.
const nav = async (name) => {
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

async function selectJob() {
  await nav("Board");
  const chip = page.getByRole("tab", { name: /001/ });
  if ((await chip.getAttribute("aria-selected")) !== "true") await click(chip);
  await hold(600);
}
async function viewFiles(pickName) {
  await click(page.getByRole("button", { name: "View files and activity" }));
  await hold(1200);
  if (pickName) await click(page.getByRole("dialog").getByRole("button", { name: pickName }).first());
}
const closeDialog = async () => { await page.keyboard.press("Escape"); await hold(500); };

// ---- the demo ------------------------------------------------------------------------------
// Captions are short and visual; `vo` is what the narrator says. In `vo`, a line break is a short
// pause and a blank line is a long one (see tts.py). Each scene waits for its line to finish
// (finish()) so picture and voice stay together, and ends on a phrase that leads into the next.
try {
  await page.goto(BASE);
  await hold(1000);

  // ============ Cold open ============
  await card("Reviewed. Tested. Merged.", "And all you did was say yes, twice.",
    "What if a feature request came back reviewed, tested, and merged...\nand all you did was say yes, twice?");
  await finish(250);
  await card("Forgeline", "The software factory you can watch.",
    "This is Forgeline.\n\nA software factory you can actually watch.", "Introducing");
  await finish(250);
  await card("Who read it? Who tested it?", "AI can write code. Trust is the hard part.",
    "AI can write code now. The hard part is trusting it.\nWho read it? Who tested it?\nWhat did it touch, and why?");
  await finish(250);
  await card("Describe. Approve. Ship.", "Fourteen agents. Two decisions. All of it visible.",
    "Forgeline answers all of that.\n\nYou describe the work. Fourteen specialist agents do it, in the open.\nAnd you make the two calls that matter.");
  await finish(300);
  await card();
  await hold(250);

  // ============ Workspace ============
  await nav("Board");
  await cap("Board", "Every job. Every stage. At a glance.",
    "Let's look around.\n\nThis is the Board. Every job is a card, moving from intent, to merged.\nYou see what's running, and what's waiting on you.");
  await finish(200);
  await nav("New job");
  await cap("New job", "A sentence, a ticket, or a bug.",
    "New job is how you ask.\nA sentence, a ticket key, a bug report. That's all it takes.");
  await finish(200);
  await nav("Agents");
  await cap("Agents", "The team, laid out as a pipeline.",
    "Agents is the team. We'll meet them in a minute.");
  await finish(200);
  await nav("Activity");
  await cap("Activity · Runs · Metrics", "The record of everything.",
    "And Activity, Runs and Metrics...\nkeep the record. Let's put something through, and watch them fill up.");
  await hold(500);
  await nav("Runs");
  await hold(500);
  await nav("Metrics");
  await finish(200);

  // ============ One job ============
  await nav("New job");
  await capTop("Describe the work", "Plain English. No template.",
    "Say I need a function that turns any text into a clean web address. With tests.\nI'll just type it.");
  await finish(100);
  const task = page.getByLabel("Task");
  await glide(task);
  await task.click();
  await task.pressSequentially(TASK, { delay: 26 });
  await hold(500);
  await click(page.getByRole("button", { name: "Send", exact: true }));
  await capTop("The factory starts", "An orchestrator opens a job.",
    "I hit send.\n\nAn agent restates the request in plain words, and lists any open questions.");
  await until("intent stage", stageIs("intent"));
  await until("first run to finish", runDone);
  await finish(300);

  await selectJob();
  await cap("Your call · 1 of 2", "Read the intent. Accept it. Nothing moves until you do.",
    "Here's what it understood.\nRead it. If it's right, accept.\n\nThat's your first call.", "action");
  await viewFiles();
  await finish(300);
  await closeDialog();
  await click(page.getByRole("button", { name: "Accept intent", exact: true }));
  await hold(800);

  await nav("Agents");
  await cap("Spec · live", "spec-writer is working. Its tile pulses.",
    "Now watch the Agents page.\nThe first agent is done. The spec writer is working, and the link to the next stage lights up.");
  await until("spec-approval", stageIs("spec-approval"));
  await finish(200);

  await selectJob();
  await cap("Your call · 2 of 2", "Approve the spec, or send it back with a note.",
    "Next, a spec. Criteria a test can check, and a risk level.\n\nApprove it, and you can step back.", "action");
  await viewFiles("spec.md");
  await finish(300);
  await closeDialog();
  await click(page.getByRole("button", { name: "Approve spec", exact: true }));
  await hold(800);

  await nav("Agents");
  await cap("Plan → Build", "The builder is the only agent that can edit code.",
    "The planner reads the real code, and writes the plan.\nThen the builder, the only agent allowed to edit files, builds it, and runs the tests.");
  await until("plan to finish", stageIs("build", "review", "approve", "merged"));
  await finish(200);
  await nav("Activity");
  await cap("Activity", "Every tool call, live.",
    "Everything lands in this feed, as it happens.\nSame as the terminal. Nothing hidden.");
  await finish(200);
  await nav("Agents");
  await until("review", stageIs("review", "approve", "merged"));
  await cap("Review", "Security. UX. UI. Code. In parallel.",
    "Then four reviewers check the branch at once.\nSecurity, user experience, interface design, and code.");
  await until("approve", stageIs("approve", "merged"));
  await finish(100);
  await cap("Approve", "Merge, or hand it back to a person.",
    "And the approver makes the call. Merge, or hand it back to a human.");
  await finish(200);
  await selectJob();
  await cap("A review, up close", "Findings. Evidence. A verdict.",
    "Every review is a plain document. Findings, evidence, and a clear verdict.");
  await viewFiles("review-security");
  await finish(300);
  await closeDialog();
  await until("merged", stageIs("merged"), 120000);
  await until("last run to finish", runDone, 120000);
  await nav("Board");
  await hold(500);
  await cap("Merged", "Tests passed. Landed on main.",
    "Merged.\n\nThe merge gate landed it on main, and only after the tests passed.\nThe agents never merge on their own.");
  await finish(300);

  // ============ Agents ============
  await nav("Agents");
  await click(page.getByRole("tab", { name: "All jobs" }));
  await hold(300);
  await cap("The team", "Fourteen agents. One job each.",
    "So who did all that?\n\nFourteen agents, and each one has exactly one job.\nFive stages across the top. And underneath, two support groups.");
  await finish(200);

  await click(agentTile("intent-writer"));
  await cap("intent-writer", "Turns a raw idea into a clear intent.",
    "The intent writer turns a rough idea into a clear one.\n\nClick any agent, and you see its model, its tools, and its full prompt.\nIt's just a markdown file. Read it. Change it.");
  await finish(200);
  await click(agentTile("planner"));
  await cap("planner", "Reads the real code, then plans.",
    "The planner reads the real code, before it plans.");
  await finish(150);
  await click(agentTile("builder"));
  await cap("builder", "The only agent with edit access.",
    "The builder is the only one with the edit tool.\nIt builds on its own branch, and tests as it goes.");
  await finish(150);
  await click(agentTile("reviewer-security"));
  await cap("Reviewers", "Read-only. Nobody grades their own work.",
    "Reviewers are read-only.\nSo nobody grades their own work.");
  await finish(150);
  await click(agentTile("approver"));
  await cap("approver", "The final gate.",
    "The approver is the final gate.\nIt writes down why, either way.");
  await finish(150);
  await click(agentTile("scanner-security"));
  await cap("Maintain loop", "Scanners find. A diagnoser explains.",
    "Underneath, scanners watch the codebase, and try to disprove their own findings.\nA diagnoser explains what drifted.\nThey report. They never change anything.");
  await finish(200);
  await click(page.getByLabel("Search agents"));
  await page.getByLabel("Search agents").pressSequentially("review", { delay: 90 });
  await cap("Search · Table view", "Find any agent. Compare them side by side.",
    "Search finds any agent in a keystroke.\nAnd the table view lines them up, side by side.");
  await hold(500);
  await click(page.getByRole("button", { name: "Table view" }));
  await finish(300);
  await page.getByLabel("Search agents").fill("");
  await click(page.getByRole("button", { name: "Pipeline view" }));
  await hold(300);

  // ============ The record ============
  await nav("Board");
  await selectJob();
  await cap("Everything is kept", "Documents. History. Cost.",
    "And afterwards, you keep everything.\n\nOn the Board, the finished job. Every stage ticked, four reviews passed.");
  await finish(200);
  await nav("Activity");
  await cap("Activity", "Every tool call. In order.",
    "Activity is the full story, in order.\nWhen you want to know why something happened, start here.");
  await finish(200);
  await nav("Runs");
  await cap("Runs", "Replay any run. Or resume it.",
    "Runs keeps every run, so you can replay it, or pick it up in Claude Code.");
  await hold(600);
  await click(page.getByRole("button", { name: /approve-spec/ }).first());
  await finish(600);
  await closeDialog();
  await nav("Metrics");
  await cap("Metrics", "Cost. Tokens. First-pass rate.",
    "And Metrics. What it cost, and how often the first attempt was good enough.");
  await finish(300);

  await cap();
  await card("Describe it. Approve it twice. Ship it.", "Forgeline runs on your machine, with the Claude Code you already use.",
    "Describe it.\nApprove it twice.\nShip it.\n\nForgeline. It runs on your machine, with the Claude Code you already use.",
    "Forgeline");
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
  fs.renameSync(file, path.join(OUT, "forgeline-demo.webm"));
  fs.writeFileSync(path.join(OUT, "vo.json"), JSON.stringify(voEvents, null, 1));
  await browser.close();
  log("saved", path.join(OUT, "forgeline-demo.webm"));
}
