import { chromium } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve("docs/assets");
const frames = resolve("test-results/doc-frames");
await mkdir(frames, { recursive: true });
const server = spawn(process.execPath, ["scripts/serve-example.mjs"], {
  env: { ...process.env, PORT: "4174" },
  stdio: ["ignore", "pipe", "inherit"],
});
let browser;
try {
  await new Promise((resolveReady, reject) => {
    server.once("error", reject);
    server.once("exit", (code) =>
      reject(new Error(`Example server exited: ${code}`)),
    );
    server.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Example ready")) resolveReady();
    });
  });
  browser = await chromium.launch();
  const hero = await browser.newPage({
    viewport: { width: 1200, height: 360 },
    deviceScaleFactor: 2,
  });
  await hero.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${await readFile(resolve(output, "hero.svg"), "utf8")}`,
  );
  await hero.screenshot({
    path: resolve(output, "hero.png"),
    omitBackground: true,
  });
  await hero.close();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 840 },
    deviceScaleFactor: 1,
  });
  await page.goto("http://127.0.0.1:4174/");
  const modes = ["real", "empty", "error", "patch"];
  for (const mode of modes) {
    await page
      .getByRole("button", {
        name: {
          real: "Real API",
          empty: "Empty",
          error: "Error",
          patch: "Patch",
        }[mode],
        exact: true,
      })
      .click();
    await page.waitForFunction(
      (mode) => document.body.dataset.ready === mode,
      mode,
    );
    await page.screenshot({ path: resolve(frames, `${mode}.png`) });
    if (mode === "patch")
      await page.screenshot({ path: resolve(output, "playground.png") });
  }
  execFileSync(
    "python3",
    [
      "-c",
      `
from PIL import Image
from pathlib import Path
import sys
frames = [Image.open(Path(sys.argv[1]) / (name + '.png')).convert('RGB') for name in ['real', 'empty', 'error', 'patch']]
frames[0].save(sys.argv[2], save_all=True, append_images=frames[1:], duration=[2300,2300,2300,3000], loop=0, optimize=True)
`,
      frames,
      resolve(output, "scenarios.gif"),
    ],
    { stdio: "inherit" },
  );
  console.log(
    "Rendered hero.png, playground.png and scenarios.gif from the working example.",
  );
} finally {
  await browser?.close();
  server.kill();
}
