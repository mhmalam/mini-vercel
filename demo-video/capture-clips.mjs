// Record REAL interaction clips on the live dashboard: register a project,
// deploy it, attach a custom domain. Injects a visible cursor so the actions
// read on video. Produces public/clip-*.webm + public/real-app.png.
import puppeteer from "puppeteer";
import { createHmac } from "node:crypto";

const PASSWORD = process.env.DASHBOARD_PASSWORD;
const API_TOKEN = process.env.MV_TOKEN;
if (!PASSWORD || !API_TOKEN) throw new Error("set DASHBOARD_PASSWORD + MV_TOKEN");
const token = createHmac("sha256", PASSWORD)
  .update("mini-vercel-dashboard-session-v1")
  .digest("hex");

// clean slate: remove demo-app if a previous take left it behind
await fetch("https://api.deploy.malam.me/api/projects/demo-app", {
  method: "DELETE",
  headers: { authorization: `Bearer ${API_TOKEN}` },
}).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));

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

// visible cursor, re-injected on every navigation
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
  await page.evaluate(() => {
    const c = document.getElementById("__cur");
    if (c) {
      c.style.transform = "scale(.75)";
      setTimeout(() => (c.style.transform = ""), 180);
    }
  });
  await page.mouse.click(x, y);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- clip 1: register a project ----------
await page.goto("https://deploy.malam.me/", { waitUntil: "networkidle2" });
await sleep(1500);
let rec = await page.screencast({ path: "public/clip-register.webm" });
await sleep(1000);

await cursorTo("select");
const repoValue = await page.evaluate(() => {
  const opts = [...document.querySelectorAll("select option")];
  const hit = opts.find((o) => o.value.includes("minivercel-test"));
  return hit ? hit.value : null;
});
if (!repoValue) throw new Error("minivercel-test not in repo picker");
await page.select("select", repoValue);
await sleep(900);

await click('input[name="name"]');
await page.keyboard.down("Control");
await page.keyboard.press("KeyA");
await page.keyboard.up("Control");
await page.type('input[name="name"]', "demo-app", { delay: 70 });
await sleep(500);
await click('input[name="port"]');
await page.type('input[name="port"]', "3000", { delay: 80 });
await sleep(500);
await click('button[type="submit"]');
await page.waitForFunction(() => location.pathname.includes("/projects/demo-app"), {
  timeout: 30000,
});
await sleep(2500);
await rec.stop();
console.log("clip-register done");

// ---------- clip 2: deploy + live build logs ----------
await sleep(500);
rec = await page.screencast({ path: "public/clip-deploy.webm" });
await sleep(800);
await click(".actions .btn-primary");
await page.waitForFunction(() => location.pathname.includes("/deployments/"), {
  timeout: 30000,
});
// let the logs stream until the badge flips to live (or 100s cap)
await page
  .waitForFunction(
    () => document.querySelector("h1 .badge")?.textContent?.includes("live"),
    { timeout: 100000, polling: 500 },
  )
  .catch(() => {});
await sleep(2500);
await rec.stop();
console.log("clip-deploy done");

// ---------- clip 3: attach a custom domain ----------
await page.goto("https://deploy.malam.me/projects/demo-app", {
  waitUntil: "networkidle2",
});
await sleep(1200);
rec = await page.screencast({ path: "public/clip-domain.webm" });
await sleep(800);
await click(".head-actions .icon-btn");
await page.waitForSelector('input[name="customDomain"]', { visible: true });
await click('input[name="customDomain"]');
await page.type('input[name="customDomain"]', "demo.malam.me", { delay: 75 });
await sleep(500);
await click(".modal .btn-primary");
await page.waitForFunction(
  () => !document.querySelector(".modal") || document.body.textContent.includes("demo.malam.me"),
  { timeout: 30000 },
);
await sleep(3000);
await rec.stop();
console.log("clip-domain done");

// ---------- still: the deployed app answering on its new domain ----------
await sleep(8000); // let the reroute land
await page.goto("https://demo.malam.me/", { waitUntil: "networkidle2" });
await sleep(800);
await page.screenshot({ path: "public/real-app.png" });
console.log("real-app.png done");

await browser.close();
console.log("ALL CLIPS CAPTURED");
