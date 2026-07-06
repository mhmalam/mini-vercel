// Interaction takes: (1) deploy with a scroll through the streaming build
// logs, (2) a browse through the deployed portfolio once assets are warm.
import puppeteer from "puppeteer";
import { createHmac } from "node:crypto";

const PASSWORD = process.env.DASHBOARD_PASSWORD;
const API_TOKEN = process.env.MV_TOKEN;
const api = (path, opts = {}) =>
  fetch(`https://api.deploy.malam.me${path}`, {
    ...opts,
    headers: { authorization: `Bearer ${API_TOKEN}`, "content-type": "application/json" },
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = createHmac("sha256", PASSWORD)
  .update("mini-vercel-dashboard-session-v1")
  .digest("hex");

// fresh project, registered off-camera (the register clip already exists)
await api("/api/projects/folio-demo", { method: "DELETE" }).catch(() => {});
await sleep(8000);
await api("/api/projects", {
  method: "POST",
  body: JSON.stringify({
    name: "folio-demo",
    repoUrl: "https://github.com/mhmalam/portfolio",
    port: 3000,
  }),
});

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

// ---------- take 1: deploy + scroll through the live build logs ----------
await page.goto("https://deploy.malam.me/projects/folio-demo", {
  waitUntil: "networkidle2",
});
await sleep(1500);
let rec = await page.screencast({ path: "public/clip-build.webm" });
await sleep(800);
const { x, y } = await cursorTo(".actions .btn-primary");
await page.mouse.click(x, y);
await page.waitForFunction(() => location.pathname.includes("/deployments/"), {
  timeout: 30000,
});
await sleep(6000); // logs pouring in, auto-following the tail
// scroll up through the history, then ride back to the tail
await cursorTo(".logs");
await page.evaluate(async () => {
  const pane = document.querySelector(".logs");
  if (!pane) return;
  const smooth = async (to) => {
    const from = pane.scrollTop;
    for (let i = 1; i <= 24; i++) {
      pane.scrollTop = from + ((to - from) * i) / 24;
      await new Promise((r) => setTimeout(r, 33));
    }
  };
  await smooth(0);
  await new Promise((r) => setTimeout(r, 1200));
  await smooth(pane.scrollHeight);
});
await sleep(4000);
await rec.stop();
console.log("clip-build (with scroll) done");

// ---------- wait for live off-camera, then warm the site hard ----------
await page
  .waitForFunction(
    () => document.querySelector("h1 .badge")?.textContent?.includes("live"),
    { timeout: 360000, polling: 1000 },
  )
  .catch(() => console.log("warn: live wait timed out"));
console.log("live — warming...");
for (let i = 0; i < 3; i++) {
  await page
    .goto("https://folio-demo.malam.me/", { waitUntil: "networkidle0", timeout: 120000 })
    .catch(() => {});
  await sleep(20000);
}
await page.evaluate(async () => {
  for (let ypos = 0; ypos < document.body.scrollHeight; ypos += 500) {
    window.scrollTo(0, ypos);
    await new Promise((r) => setTimeout(r, 300));
  }
  window.scrollTo(0, 0);
});
await sleep(15000);
await page.reload({ waitUntil: "networkidle0", timeout: 120000 });
await sleep(6000);

// ---------- take 2: browse the deployed portfolio ----------
rec = await page.screencast({ path: "public/clip-portfolio.webm" });
await sleep(2500); // hold the hero
await page.evaluate(async () => {
  const smooth = async (to, steps = 40) => {
    const from = window.scrollY;
    for (let i = 1; i <= steps; i++) {
      window.scrollTo(0, from + ((to - from) * i) / steps);
      await new Promise((r) => setTimeout(r, 33));
    }
  };
  const h = document.body.scrollHeight - window.innerHeight;
  await smooth(Math.min(1400, h));
  await new Promise((r) => setTimeout(r, 1500));
  await smooth(Math.min(2800, h));
  await new Promise((r) => setTimeout(r, 1500));
  await smooth(0, 50);
});
await sleep(1500);
await rec.stop();
console.log("clip-portfolio done");

await browser.close();
await api("/api/projects/folio-demo", { method: "DELETE" });
console.log("INTERACT CAPTURED + set struck");
