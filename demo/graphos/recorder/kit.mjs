// Shared recording kit for the GraphOS demo: browser, on-screen captions and title cards, a cursor, and Piper voice-over
// with sync flashes. The captions, cursor and voice code is the existing web-studio recorder's, unchanged, so the two
// videos look and sound alike. Used by record.mjs.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// playwright-core lives where the factory demo recorder installs it (see web-studio/.claude/skills/record-demo):
//   npm install --no-save --prefix web-studio/demo/.pw playwright-core@1.64.0 monaco-editor@0.52.2
import { chromium } from "../../../web-studio/demo/.pw/node_modules/playwright-core/index.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TTS = process.env.TTS_PY ?? path.join(HERE, "tts.py");

export async function createKit({ out, size = { width: 1440, height: 810 } }) {
  const OUT = out;
  const SIZE = size;
  const CHROME = process.env.CHROME_BIN ?? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => fs.existsSync(p));
  fs.mkdirSync(OUT, { recursive: true });
  // Headless Chrome 155 records only the top ~89% of the frame (a grey band below), so the recorder runs headed, with the window off-screen
  // and rendering kept alive (macOS may otherwise throttle a window nobody can see).
  const browser = await chromium.launch({
    executablePath: CHROME, headless: false,
    args: ["--no-sandbox", "--window-position=-3000,0", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-features=CalculateNativeWinOcclusion"],
  });
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
  if (!fs.existsSync(file)) execFileSync("python3", [TTS, VO_MODEL, file], { input: clean, env: process.env, stdio: ["pipe", "ignore", "inherit"] });
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
  // Wait until a test passes, polling the page's own API.
  async function until(label, test, timeout = 240000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await test()) return;
      await hold(400);
    }
    throw new Error("timed out waiting for " + label);
  }
  // Timing: say which action was slow, so a stall in a recording can be found in the log.
  const timed = (name, fn) => async (...a) => {
    const t = Date.now();
    try { return await fn(...a); } finally {
      const secs = (Date.now() - t) / 1000;
      if (secs > 8) log("SLOW", name, secs.toFixed(1) + "s", String(a[0] ?? "").slice(0, 50));
    }
  };
  const click = timed("click", click0), nav = timed("nav", nav0), finish = timed("finish", finish0);
  const closeDialog = timed("closeDialog", async () => {
    // Escape, then make sure the dialog really is gone (retry with its close button) so the next click is never blocked.
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Escape");
      await hold(500);
      if ((await page.getByRole("dialog").count()) === 0) return;
      const x = page.getByRole("dialog").getByRole("button", { name: /close/i }).first();
      if (await x.count()) await x.click().catch(() => {});
      await hold(400);
    }
  });
  async function finishUp(name) {
    const video = page.video();
    await context.close();
    const file = await video.path();
    fs.renameSync(file, path.join(OUT, name + ".webm"));
    fs.writeFileSync(path.join(OUT, "vo.json"), JSON.stringify(voEvents, null, 1));
    await browser.close();
    log("saved", path.join(OUT, name + ".webm"));
  }
  return { page, context, browser, hold, say, cap, capTop, card, glide, click, nav, finish, closeDialog, until, log, finishUp, agentTile, OUT };
}
