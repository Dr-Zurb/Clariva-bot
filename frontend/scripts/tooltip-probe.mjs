/**
 * Temporary diagnostic probe (safe to delete).
 * Logs in, opens the appointment RX page, and dumps the live DOM + computed
 * styles for the "Social / personal history" collapsed preview and its tooltip.
 */
import path from "path";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, "..");
loadEnv({ path: path.join(frontendDir, ".env.local") });

function normalizeEnv(value) {
  if (value == null) return "";
  const t = value.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).trim();
  return t;
}

const APPT = process.env.PROBE_APPT || "4c5d0318-9055-4a2c-b252-ca67727ba290";
const DATE = process.env.PROBE_DATE || "2026-06-05";
const baseURL = `http://localhost:${process.env.E2E_PORT || "3000"}/`;

async function login(page, user, password) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByLabel(/email/i).waitFor({ state: "visible", timeout: 60_000 });
    await page.getByLabel(/email/i).fill(user);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (page.url().includes("/dashboard")) return;
      await page.waitForTimeout(500);
    }
    if (attempt === 3) throw new Error("Login failed after 3 attempts");
    await page.waitForTimeout(2000);
  }
}

async function main() {
  const user = normalizeEnv(process.env.E2E_USER);
  const password = normalizeEnv(process.env.E2E_PASSWORD);
  if (!user || !password) throw new Error("E2E_USER / E2E_PASSWORD missing in .env.local");

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  page.setDefaultTimeout(60_000);
  const logs = [];
  const log = (...a) => { logs.push(a.join(" ")); console.log(...a); };

  try {
    await login(page, user, password);
    const url = `${baseURL}dashboard/appointments/${APPT}?from=opd-today&date=${DATE}`;
    log("NAV:", url);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });

    // Wait for the section header to render.
    const header = page.getByText("Social / personal history", { exact: false }).first();
    await header.waitFor({ state: "visible", timeout: 60_000 });
    log("FOUND header 'Social / personal history'");

    // Inspect the preview element inside that section header.
    const info = await page.evaluate(() => {
      const walker = document.evaluate(
        "//*[contains(normalize-space(text()),'Social / personal history')]",
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null,
      );
      const titleEl = walker.singleNodeValue;
      const headerRow = titleEl?.closest("div") ?? titleEl?.parentElement;
      // Preview = the element containing "Smoking:" or the em-dash preview text.
      const previewEl = Array.from(headerRow?.querySelectorAll("*") ?? []).find(
        (el) => /Smoking:|—\s/.test(el.textContent || "") && el.children.length === 0,
      ) || Array.from(headerRow?.querySelectorAll("span") ?? []).find((el) =>
        /Smoking:|—\s/.test(el.textContent || ""),
      );
      const dump = (el) => {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName,
          className: el.getAttribute("class"),
          hasTitleAttr: el.hasAttribute("title"),
          titleValue: el.getAttribute("title"),
          text: (el.textContent || "").slice(0, 80),
          overflowing: el.scrollWidth > el.clientWidth + 1,
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          color: cs.color,
          bg: cs.backgroundColor,
        };
      };
      // Also scan the whole header row for ANY element carrying a title attr.
      const titled = Array.from(headerRow?.querySelectorAll("[title]") ?? []).map((el) => ({
        tag: el.tagName,
        title: el.getAttribute("title")?.slice(0, 80),
        text: (el.textContent || "").slice(0, 40),
      }));
      return {
        headerRowClass: headerRow?.getAttribute("class"),
        preview: dump(previewEl),
        titledElementsInHeader: titled,
      };
    });
    log("PREVIEW ELEMENT:", JSON.stringify(info.preview, null, 2));
    log("TITLED ELEMENTS IN HEADER:", JSON.stringify(info.titledElementsInHeader, null, 2));

    // Hover the preview and see what tooltip (if any) appears.
    const previewLocator = page.locator("section", { hasText: "Social / personal history" })
      .locator("span", { hasText: /Smoking:|—/ }).first();
    await previewLocator.hover({ timeout: 10_000 }).catch((e) => log("HOVER ERR:", e.message));
    await page.waitForTimeout(1200);

    const tip = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('[role="tooltip"], [data-radix-popper-content-wrapper] *'));
      const out = [];
      for (const el of nodes) {
        const cs = getComputedStyle(el);
        out.push({
          tag: el.tagName,
          role: el.getAttribute("role"),
          className: el.getAttribute("class")?.slice(0, 160),
          text: (el.textContent || "").slice(0, 120),
          bg: cs.backgroundColor,
          color: cs.color,
        });
      }
      return out;
    });
    log("TOOLTIP NODES AFTER HOVER:", JSON.stringify(tip, null, 2));

    await page.screenshot({ path: path.join(frontendDir, "scripts/tooltip-probe.png"), fullPage: false });
    log("SCREENSHOT: scripts/tooltip-probe.png");
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
