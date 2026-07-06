// Capture real screenshots of the live platform for the demo video.
// Logs into the dashboard with a computed session cookie (same derivation
// as the dashboard's own auth), then shoots the pages at 1920x1080.
import puppeteer from "puppeteer";
import { createHmac } from "node:crypto";

const PASSWORD = process.env.DASHBOARD_PASSWORD;
if (!PASSWORD) throw new Error("set DASHBOARD_PASSWORD");
const token = createHmac("sha256", PASSWORD)
  .update("mini-vercel-dashboard-session-v1")
  .digest("hex");

const browser = await puppeteer.launch({
  headless: "shell",
  args: ["--window-size=1920,1080"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.setCookie({
  name: "mv-session",
  value: token,
  domain: "deploy.malam.me",
  path: "/",
  httpOnly: true,
  secure: true,
});

const shot = async (url, file, extraWait = 1500) => {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, extraWait));
  await page.screenshot({ path: `public/${file}` });
  console.log("captured", file, "<-", url);
};

await shot("https://deploy.malam.me/", "real-dashboard.png");

// find a project page + its latest deployment for the logs shot
const projects = await page.evaluate(async () => {
  const links = [...document.querySelectorAll("a.card-name")].map((a) =>
    a.getAttribute("href"),
  );
  return links;
});
if (projects[0]) {
  await shot(`https://deploy.malam.me${projects[0]}`, "real-project.png");
  const dep = await page.evaluate(() => {
    const a = document.querySelector("a[href^='/deployments/']");
    return a ? a.getAttribute("href") : null;
  });
  if (dep) await shot(`https://deploy.malam.me${dep}`, "real-logs.png", 3000);
}

await shot("https://malam.me/", "real-site.png", 3000);

await browser.close();
console.log("done");
