import type { TestModeOptions, TestModeOverlayOptions } from "@uiwwsw/test-mode";

const readNodeEnv = () =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.NODE_ENV;

export const runtimeConfig = {
  cookieKey: "app.test.mode.entries",
  enabled: () => readNodeEnv() !== "production",
  eventName: "app-test-mode:change",
  storageKey: "app.test.mode.entries",
} satisfies Pick<
  TestModeOptions,
  "cookieKey" | "enabled" | "eventName" | "storageKey"
>;

export const testOverlayConfig = {
  datasetName: "test",
  globalName: "test",
  namespace: "__appTestMode",
  watermarkText: "TEST MODE",
} satisfies Pick<
  TestModeOverlayOptions,
  "datasetName" | "globalName" | "namespace" | "watermarkText"
>;



