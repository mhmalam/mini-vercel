// Film the full lifecycle on the LIVE platform using the real portfolio repo:
//   1. shot-empty.png        folio-demo.malam.me before it exists (branded 404)
//   2. clip-register.webm    picking the portfolio repo, naming it folio-demo
//   3. clip-build.webm       deploy click + first seconds of real build logs
//   4. clip-live.webm        the deployment page as it sits live
//   5. shot-deployed.png     folio-demo.malam.me serving the actual portfolio
//   6. clip-banner.webm      a real `git push` -> dashboard notices on its own
import puppeteer from "puppeteer";
import { createHmac } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync, appendFileSync } from "node:fs";

const PASSWORD = process.env.DASHBOARD_PASSWORD;
const API_TOKEN = process.env.MV_TOKEN;
const REPO_DIR = process.env.PORTFOLIO_CLONE;
if (!PASSWORD || !API_TOKEN || !REPO_DIR) throw new Error("missing env");
const api = (path, opts = {}) =>
  fetch(`https://api.deploy.malam.me${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${API_TOKEN}`, "content-type": "application/json" },
  });

const token = createHmac("sha256", PASSWORD)
  .update("mini-vercel-dashboard-session-v1")
  .digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// clean slate
await api("/api/projects/folio-demo", { method: "DELETE" }).catch(() => {});
await sleep(8000);

const browser = await puppeteer.launch({
  headless: true,
  args: ["--window-size=1920,1080", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
await page.setCookie({
  name: "mv-session",
  value: token,
  domain: "deploy.malam.me",
  path: "/",
  httpOnly: true,
  secure: true,
});

await page.evaluateOnNewDocument(() => {
  window.addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.id = "__cur";
    c.style.cssText =
      "position:fixed;left:960px;top:540px;width:26px;height:26px;border-radius:50%;" +
      "background:rgba(255,178,36,.85);border:3px solid #fff;z-index:99999;" +
      "pointer-events:none;transition:left .5s cubic-bezier(.3,.7,.4,1),top .5s cubic-bezier(.3,.7,.4,1);" +
      "box-shadow:0 2px 14px rgba(0,0,0,.5)";
    document.body.appendChild(c);
  });
});

const cursorTo = async (selector, dx = 0, dy = 0) => {
  const el = await page.waitForSelector(selector, { visible: true, timeout: 30000 });
  const box = await el.boundingBox();
  const x = box.x + box.width / 2 + dx;
  const y = box.y + box.height / 2 + dy;
  await page.evaluate(
    ([x, y]) => {
      const c = document.getElementById("__cur");
      if (c) {
        c.style.left = x - 13 + "px";
        c.style.top = y - 13 + "px";
      }
    },
    [x, y],
  );
  await sleep(700);
  return { x, y };
};
const click = async (selector, dx = 0, dy = 0) => {
  const { x, y } = await cursorTo(selector, dx, dy);
  await page.mouse.click(x, y);
};

// ---------- 1. the before shot: nothing deployed ----------
await page.goto("https://folio-demo.malam.me/", { waitUntil: "networkidle2" });
await sleep(1200);
await page.screenshot({ path: "public/shot-empty.png" });
console.log("shot-empty done");

// ---------- 2. register folio-demo from the real portfolio repo ----------
await page.goto("https://deploy.malam.me/", { waitUntil: "networkidle2" });
await sleep(1500);
let rec = await page.screencast({ path: "public/clip-register.webm" });
await sleep(1000);
await cursorTo("select");
const repoValue = await page.evaluate(() => {
  const opts = [...document.querySelectorAll("select option")];
  const hit = opts.find((o) => o.value.endsWith("/portfolio.git"));
  return hit ? hit.value : null;
});
if (!repoValue) throw new Error("portfolio repo not in picker");
await page.select("select", repoValue);
await sleep(900);
await click('input[name="name"]');
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.type('input[name="name"]', "folio-demo", { delay: 70 });
await sleep(400);
await click('input[name="port"]');
await page.type('input[name="port"]', "3000", { delay: 80 });
await sleep(400);
await click('button[type="submit"]');
await page.waitForFunction(() => location.pathname.includes("/projects/folio-demo"), {
  timeout: 30000,
});
await sleep(2200);
await rec.stop();
console.log("clip-register done");

// ---------- 3. deploy: film the click + the logs coming alive ----------
await sleep(500);
rec = await page.screencast({ path: "public/clip-build.webm" });
await sleep(800);
await click(".actions .btn-primary");
await page.waitForFunction(() => location.pathname.includes("/deployments/"), {
  timeout: 30000,
});
await sleep(9000); // real Next.js build output scrolling
await rec.stop();
console.log("clip-build done");

// ---------- 4. wait (off camera) for live, then film the result ----------
await page
  .waitForFunction(
    () => document.querySelector("h1 .badge")?.textContent?.includes("live"),
    { timeout: 360000, polling: 1000 },
  )
  .catch(() => console.log("warn: live badge wait timed out"));
await sleep(1000);
rec = await page.screencast({ path: "public/clip-live.webm" });
await sleep(5000);
await rec.stop();
console.log("clip-live done");

// ---------- 5. the after shot: the real portfolio on the new URL ----------
await sleep(2000);
await page.goto("https://folio-demo.malam.me/", { waitUntil: "networkidle2", timeout: 60000 });
await sleep(2500);
await page.screenshot({ path: "public/shot-deployed.png" });
console.log("shot-deployed done");

// ---------- 6. the push: dashboard notices on its own ----------
// commit is staged in the local clone by the caller; we push mid-recording
await page.goto("https://deploy.malam.me/", { waitUntil: "networkidle2" });
await sleep(1500);
rec = await page.screencast({ path: "public/clip-banner.webm" });
await sleep(2000);
execSync("git push origin main", { cwd: REPO_DIR, stdio: "inherit" });
console.log("pushed — waiting for the banner...");
await page
  .waitForFunction(() => !!document.querySelector(".activity-banner"), {
    timeout: 45000,
    polling: 500,
  })
  .catch(() => console.log("warn: banner wait timed out"));
await sleep(6000); // banner + pulsing building lamps on film
await rec.stop();
console.log("clip-banner done");

await browser.close();
console.log("LIFECYCLE CAPTURED");
