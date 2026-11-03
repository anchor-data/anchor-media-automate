/**
 * PoC: free text -> DesignSpec -> HTML -> PNG with a real browser, using the text of an existing post.
 *   POST_ID=post_... OUT_DIR=/tmp/poc pnpm --filter @ama/renderer poc
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { DEFAULT_DESIGN_SPEC, SLIDE_HEIGHT, SLIDE_WIDTH, renderSlideHtml, requestSpecPatch, type DesignSpec } from "../src/index";

const POST_ID = process.env.POST_ID ?? "";
const OUT_DIR = resolve(process.env.OUT_DIR ?? "/tmp/ama-poc");
const API = process.env.API_URL ?? "http://localhost:8787/api";
const PAGES = [1, 3, 7, 8];
const CHROME = join(
  homedir(),
  "Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell"
);

const REQUESTS: Array<{ name: string; text: string | null }> = [
  { name: "default", text: null },
  { name: "calm-green", text: "落ち着いた緑系にして。見出しは細めで、番号は左寄せ。装飾はなし" },
  { name: "pop-orange", text: "ポップなオレンジと黒。角丸は強め、見出しは極太で下線あり、装飾はドット柄" }
];

function rootEnv(key: string): string | undefined {
  const text = readFileSync(resolve(import.meta.dirname, "../../../.env"), "utf8");
  return text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
}

async function main() {
  if (!POST_ID) throw new Error("Set POST_ID");
  mkdirSync(OUT_DIR, { recursive: true });
  const detail = (await (await fetch(`${API}/posts/${POST_ID}`)).json()) as { post: { slidesJson: Record<string, string> } };
  const fields = detail.post.slidesJson;

  const specs: Array<{ name: string; spec: DesignSpec }> = [];
  for (const { name, text } of REQUESTS) {
    if (text === null) {
      specs.push({ name, spec: DEFAULT_DESIGN_SPEC });
      continue;
    }
    const { spec, patch } = await requestSpecPatch({ apiKey: rootEnv("OPENAI_API_KEY"), request: text, current: DEFAULT_DESIGN_SPEC });
    console.log(`${name}: ${JSON.stringify(patch)}`);
    specs.push({ name, spec });
    writeFileSync(join(OUT_DIR, `${name}.spec.json`), JSON.stringify(spec, null, 2));
  }

  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT } });
  for (const { name, spec } of specs) {
    for (const index of PAGES) {
      await page.setContent(renderSlideHtml({ spec, index, fields, handle: "@anchor" }));
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: join(OUT_DIR, `${name}-${index}.png`) });
    }
  }

  const rows = specs
    .map(
      ({ name }) =>
        `<div style="display:flex;gap:12px;margin-bottom:12px">${PAGES.map((i) => `<img src="file://${join(OUT_DIR, `${name}-${i}.png`)}" width="360">`).join("")}</div>`
    )
    .join("");
  writeFileSync(join(OUT_DIR, "sheet.html"), `<body style="margin:8px;background:#ccc">${rows}</body>`);
  const sheetPage = await browser.newPage({ viewport: { width: 1500, height: 1500 } });
  await sheetPage.goto(`file://${join(OUT_DIR, "sheet.html")}`);
  await sheetPage.screenshot({ path: join(OUT_DIR, "sheet.png"), fullPage: true });
  await browser.close();
  console.log(`done: ${OUT_DIR}`);
}

void main();
