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
  #__title{position:fixed;inset:0;pointer-events:none;z-index:100000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0e1411;color:#e6ede9;font:var(--font-body,system-ui);text-align:center;padding:40px}
  #__title h1{margin:0;font:600 54px/1.1 var(--font-display,system-ui);letter-spacing:-.02em}
  #__title p{margin:0;font:400 22px/1.45 var(--font-body,system-ui);color:#9aaaa2;max-width:900px}
  `;
  const mount = () => {
    if (document.getElementById("__cursor")) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.head.appendChild(style);
    for (const [id, tag] of [["__cursor", "div"], ["__cap", "div"], ["__title", "div"]]) {
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
  window.__title = (h, p) => {
    mount();
    const el = document.getElementById("__title");
    if (!h) { el.style.display = "none"; return; }
    el.innerHTML = `<h1>${h}</h1><p>${p ?? ""}</p>`;
    el.style.display = "flex";
  };
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
  const clean = text.replace(/<[^>]+>/g, "").replace(/\s*·\s*/g, ", ").replace(/\b(\d) of (\d)\b/g, "$1 of $2").replace(/\.md\b/g, " dot M D").replace(/\s+/g, " ").trim();
  const file = path.join(VO_DIR, createHash("sha1").update(clean).digest("hex").slice(0, 12) + ".wav");
  fs.mkdirSync(VO_DIR, { recursive: true });
  if (!fs.existsSync(file)) execFileSync(VO_PY, ["-m", "piper", "-m", VO_MODEL, "-f", file], { input: clean, stdio: ["pipe", "ignore", "ignore"] });
  const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString()) * 1000;
  return { file, dur };
}
// Wait for the previous line to finish, then start this one; returns when it is on screen.
async function say(text) {
  const v = speak(text);
  const wait = voBusyUntil - Date.now();
  if (wait > 0) await hold(wait);
  if (v) { voEvents.push({ at: Date.now() - T0 + 120, file: v.file, ms: v.dur }); voBusyUntil = Date.now() + v.dur + 450; }
  return v;
}
const cap = async (title, text, kind = "info") => {
  if (!title) return page.evaluate(() => window.__cap());
  const v = await say(title + ". " + (text ?? ""));
  await page.evaluate(() => window.__cap());      // old caption leaves with its own exit animation
  await hold(280);                                // a visible gap so two captions never read as one
  step += 1;
  await page.evaluate(([k, t, x, n, d]) => window.__cap(k, t, x, n, d), [kind, title, text, step, v ? v.dur : 4000]);
};
const capTop = (title, text) => cap(title, text, "info top");
const card = async (h, p) => {
  if (h) await say(h + ". " + (p ?? ""));
  await page.evaluate(([a, b]) => window.__title(a, b), [h, p]);
};

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
const nav = (name) => click(page.getByRole("button", { name: new RegExp("^" + name) }).first());
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
try {
  await page.goto(BASE);
  await hold(1500);
  await card("Forgeline", "A web view over the software factory. Describe the work, watch agents do it, and approve the two points that matter.");
  await hold(4200);
  await card();
  await hold(600);

  // 1. Tour
  await cap("Six pages, one app", "Board, New job, Agents, Activity, Runs and Metrics. The same factory the terminal, desktop app and VS Code drive.");
  for (const n of ["New job", "Agents", "Activity", "Runs", "Metrics", "Board"]) { await nav(n); await hold(1500); }

  // 2. Describe the work
  await nav("New job");
  await capTop("Step 1 · Describe the work", "A sentence, a Jira key or a bug report. Feature or bug fix, and the MCP servers it may use.");
  await hold(2200);
  const task = page.getByLabel("Task");
  await glide(task);
  await task.click();
  await task.pressSequentially(TASK, { delay: 28 });
  await hold(900);
  await click(page.getByRole("button", { name: "Send", exact: true }));
  await capTop("The factory starts", "The orchestrator creates a job and the intent-writer drafts intent.md. Everything streams live.");
  await until("intent stage", stageIs("intent"));
  await until("first run to finish", runDone);
  await hold(1500);

  // 3. Intent: first acceptance
  await selectJob();
  await cap("What it produced · intent.md", "Your request in your own words, with open questions.");
  await viewFiles();
  await hold(5200);
  await closeDialog();
  await cap("Needs your acceptance · 1 of 2", "Read the intent, then accept it. Nothing moves until you do.", "action");
  await hold(2800);
  await click(page.getByRole("button", { name: "Accept intent", exact: true }));
  await hold(1500);

  // 4. Spec: agent view while spec-writer works
  await cap("Spec", "The spec-writer turns the intent into spec.md. Watch the stream.");
  await hold(4500);
  await nav("Agents");
  await cap("Agents page · scoped to this job", "intent-writer is done. spec-writer is working now, so its tile pulses. The link to the next lane animates.");
  await until("spec-approval", stageIs("spec-approval"));
  await hold(2500);

  // 5. Spec: second acceptance
  await selectJob();
  await cap("What it produced · spec.md", "Testable acceptance criteria and a risk tier.");
  await viewFiles("spec.md");
  await hold(6000);
  await closeDialog();
  await cap("Needs your acceptance · 2 of 2", "Approve the spec, or send it back with a note. The belt up top says Waiting on you.", "action");
  await hold(3200);
  await click(page.getByRole("button", { name: "Approve spec", exact: true }));
  await hold(1200);

  // 6. Agents transitions
  await nav("Agents");
  await cap("Plan", "The planner reads the real code and writes plan.md: files to change, tests, blast radius, rollback.");
  await until("plan to finish", stageIs("build", "review", "approve", "merged"));
  await cap("Build", "The builder works on its own branch, runs the tests and writes build.md.");
  await hold(5000);
  await nav("Activity");
  await cap("Activity · the same feed as the terminal", "Every tool call and agent start, from hooks that run in every Claude Code surface.");
  await hold(4500);
  await selectJob();
  await cap("What it produced · plan.md", "Open any stage's file from the job panel.");
  await viewFiles("plan.md");
  await hold(4500);
  await closeDialog();
  await nav("Agents");
  await until("review", stageIs("review", "approve", "merged"));
  await cap("Review", "Four reviewers run in parallel: security, UX, UI and code. Each writes a verdict.");
  await hold(5500);
  await until("approve", stageIs("approve", "merged"));
  await cap("Approve", "The approver reads the four verdicts and decides: merge, or hand it back to you.");
  await hold(3500);
  await selectJob();
  await cap("What it produced · a review", "Findings and a PASS or CHANGES verdict, with the evidence.");
  await viewFiles("review-security");
  await hold(4500);
  await closeDialog();
  await until("merged", stageIs("merged"), 120000);
  await until("last run to finish", runDone, 120000);

  // 7. Result
  await nav("Board");
  await hold(1200);
  await cap("Merged", "The merge gate landed the branch on main after the tests passed. Agents never push or merge by themselves.");
  await hold(4500);
  await selectJob();
  await cap("The finished job", "Every stage done, four PASS verdicts, one review round.");
  await hold(4500);
  await nav("Agents");
  await click(page.getByRole("tab", { name: "All jobs" }));
  await cap("Agents · all jobs", "Every agent that worked, with its event count. All are idle now.");
  await hold(4500);
  await nav("Runs");
  await cap("Runs", "Every run is kept and can be replayed, or resumed in Claude Code.");
  await hold(2500);
  await click(page.getByRole("button", { name: /approve-spec/ }).first());
  await hold(5000);
  await closeDialog();
  await nav("Metrics");
  await cap("Metrics", "Jobs merged, first-pass rate, cost and tokens by model and by job.");
  await hold(6000);
  await cap();
  await card("Two approvals, one merged change", "You accepted the intent and the spec. Fourteen agents planned, built, reviewed and merged it, and everything is on disk and visible from every surface.");
  await hold(6000);
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
