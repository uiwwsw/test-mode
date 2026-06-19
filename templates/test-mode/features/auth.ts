import { defineMock, httpResult } from "@uiwwsw/test-mode";

export const authFeatures = [
  defineMock(
    "/api/session/signin",
    () =>
      httpResult({
        data: {
          code: "AU-105",
          data: null,
          message: "Password is locked",
          status: 400,
        },
        status: 200,
        statusText: "OK",
      }),
    {
      caseKey: "locked",
      description: "Login locked account branch",
      pages: ["/login"],
    },
  ),
];
