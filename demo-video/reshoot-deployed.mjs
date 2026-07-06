// Rebuild folio-demo off-camera, let the portfolio's assets fully warm up,
// reshoot the "deployed" still, then strike the set again.
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

// register + deploy via API (no filming)
await api("/api/projects", {
  method: "POST",
  body: JSON.stringify({
    name: "folio-demo",
    repoUrl: "https://github.com/mhmalam/portfolio",
    port: 3000,
  }),
});
const dep = await (
  await api("/api/projects/folio-demo/deployments", { method: "POST" })
).json();
console.log("deploying", dep.id);
for (let i = 0; i < 90; i++) {
  await sleep(5000);
  const d = await (await api(`/api/deployments/${dep.id}`)).json();
  if (d.status === "live") break;
  if (d.status === "failed") throw new Error("deploy failed");
}
console.log("live — warming up assets...");
await sleep(20000);

const browser = await puppeteer.launch({
  headless: true,
  args: ["--window-size=1920,1080", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
const token = createHmac("sha256", PASSWORD)
  .update("mini-vercel-dashboard-session-v1")
  .digest("hex");
await page.setCookie({
  name: "mv-session",
  value: token,
  domain: "deploy.malam.me",
  path: "/",
  httpOnly: true,
  secure: true,
});

await page.goto("https://folio-demo.malam.me/", {
  waitUntil: "networkidle0",
  timeout: 120000,
});
// long settle + scroll through to force every lazy asset, then back to top
await sleep(45000);
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 500) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 350));
  }
  window.scrollTo(0, 0);
});
await sleep(30000);
await page.reload({ waitUntil: "networkidle0", timeout: 120000 });
await sleep(8000);
await page.screenshot({ path: "public/shot-deployed.png" });
console.log("shot-deployed reshot (warmed)");

await browser.close();
await api("/api/projects/folio-demo", { method: "DELETE" });
console.log("folio-demo struck");
