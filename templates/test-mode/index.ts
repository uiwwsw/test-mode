import { createTestMode } from "@uiwwsw/test-mode";
import { runtimeConfig } from "./config";
import { authFeatures } from "./features/auth";
import { authStories } from "./stories/auth.stories";

export const runtime = createTestMode({
  ...runtimeConfig,
  definitions: [...authFeatures],
  patchDefinitions: [],
  stories: [...authStories],
});



