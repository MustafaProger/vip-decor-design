import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInquiryServer } from "./index.mjs";
import { createSiteHandler } from "./site.mjs";

function scheduleReviews(server) {
  let timer;
  let stopped = false;
  const refresh = async () => {
    let delay = 60 * 60 * 1000;
    try {
      const result = await server.reviewService.refreshIfDue();
      if (result.status === "updated")
        console.log("Reviews refreshed:", result.snapshot.reviews.length);
      if (result.status === "failed") {
        console.error(
          "Reviews refresh failed; last successful snapshot retained:",
          result.refresh?.errorCode || "source_unavailable",
        );
      }
      const state = await server.reviewService.getStatus();
      const attempted = Date.parse(state.lastAttemptAt);
      if (Number.isFinite(attempted))
        delay = Math.max(
          1000,
          attempted + 24 * 60 * 60 * 1000 - Date.now() + 1000,
        );
    } catch {
      console.error("Reviews refresh could not run; cached reviews retained.");
    }
    if (!stopped) {
      timer = setTimeout(refresh, delay);
      timer.unref();
    }
  };
  server.on("close", () => {
    stopped = true;
    clearTimeout(timer);
  });
  void refresh();
}

export async function startProductionServer(options = {}) {
  const port = Number(
    options.port ?? process.env.PORT ?? process.env.INQUIRY_PORT ?? 3001,
  );
  const hostname = options.hostname || process.env.INQUIRY_HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid server port.");
  const siteHandler = options.siteHandler || (await createSiteHandler(options));
  const server = await createInquiryServer({ ...options, siteHandler });
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  if (options.refreshReviews !== false) scheduleReviews(server);
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const server = await startProductionServer();
    const address = server.address();
    console.log(
      `VIP Decor website and CMS: http://${address.address}:${address.port}`,
    );
    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.once(signal, () => server.close());
    }
  } catch (error) {
    console.error("Could not start the website and CMS:", error.message);
    console.error("Build the project first with npm run build.");
    process.exitCode = 1;
  }
}
