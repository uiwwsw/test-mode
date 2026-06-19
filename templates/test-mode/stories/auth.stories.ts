import { defineStory, entry } from "@uiwwsw/test-mode";

export const authStories = [
  defineStory({
    key: "auth.login.locked",
    title: "Login - locked account",
    description: "Shows the locked password branch on the login screen.",
    entries: [entry("/api/session/signin", "locked")],
  }),
];
