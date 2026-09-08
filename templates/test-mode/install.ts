import { installMockFetch, installTestModeOverlay } from "@uiwwsw/test-mode";
import { testOverlayConfig } from "./config";
import { runtime } from "./index";

export const installAppTestMode = () => {
  const uninstallOverlay = installTestModeOverlay(runtime, testOverlayConfig);
  const uninstallFetch = installMockFetch(runtime);

  return () => {
    uninstallFetch();
    uninstallOverlay();
  };
};
