import { test, expect } from "@playwright/test";

test("the documentation demo uses real transport, mock errors and response patches", async ({
  page,
}) => {
  const errors = [];
  const requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/cart") requests.push(request);
  });
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "real");
  await expect(page.locator("#cart")).toContainText("$42.00");
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Empty", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "empty");
  await expect(page.locator("#cart")).toContainText(
    "Your cart is a blank canvas.",
  );
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Error", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "error");
  await expect(page.locator("#http-status")).toHaveText(
    "503 Service Unavailable",
  );
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Patch", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-ready", "patch");
  await expect(page.locator("#cart")).toContainText("$32.00");
  await expect(page.locator("#cart")).toContainText("Canvas tote");
  expect(requests).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("the documentation demo remains usable on a phone-sized viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("http://127.0.0.1:4173/");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "real");
  await page.getByRole("button", { name: "Empty", exact: true }).click();
  await expect(page.locator("#cart")).toContainText(
    "Your cart is a blank canvas.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
