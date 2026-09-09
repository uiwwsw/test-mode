import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "dist");
const port = Number(process.env.PORT || 4173);
const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, "http://localhost");
  response.setHeader("cache-control", "no-store");
  try {
    if (pathname === "/api/cart") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          items: [
            { name: "Canvas tote", price: 24 },
            { name: "Everyday mug", price: 18 },
          ],
          total: 42,
        }),
      );
      return;
    }
    if (pathname === "/" || pathname === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(
        await readFile(resolve(root, "examples/browser/index.html")),
      );
      return;
    }
    const path = resolve(root, `.${pathname}`);
    if (path.startsWith(dist + sep) && /\.(js|map)$/.test(pathname)) {
      const body = await readFile(path);
      response.writeHead(200, {
        "content-type": pathname.endsWith(".js")
          ? "text/javascript"
          : "application/json",
      });
      response.end(body);
      return;
    }
    response.writeHead(404);
    response.end("Not found");
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Example ready at http://127.0.0.1:${port}`),
);
