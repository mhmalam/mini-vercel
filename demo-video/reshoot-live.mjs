// Re-shoot the two "after" pieces now that folio-demo is genuinely live.
import puppeteer from "puppeteer";
import { createHmac } from "node:crypto";

const PASSWORD = process.env.DASHBOARD_PASSWORD;
const token = createHmac("sha256", PASSWORD)
  .update("mini-vercel-dashboard-session-v1")
  .digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// the live deployment page of folio-demo
await page.goto("https://deploy.malam.me/projects/folio-demo", {
  waitUntil: "networkidle2",
});
const dep = await page.evaluate(() => {
  const a = document.querySelector("a[href^='/deployments/']");
  return a ? a.getAttribute("href") : null;
});
await page.goto(`https://deploy.malam.me${dep}`, { waitUntil: "networkidle2" });
await sleep(2000);
const rec = await page.screencast({ path: "public/clip-live.webm" });
await sleep(5000);
await rec.stop();
console.log("clip-live reshot");

await page.goto("https://folio-demo.malam.me/", {
  waitUntil: "networkidle2",
  timeout: 60000,
});
await sleep(3000);
await page.screenshot({ path: "public/shot-deployed.png" });
console.log("shot-deployed reshot");

await browser.close();
