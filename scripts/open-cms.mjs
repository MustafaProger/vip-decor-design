import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const url = new URL(
  "/admin",
  process.env.CMS_ADMIN_URL || "http://127.0.0.1:5180",
);
const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
  throw new Error("Для удалённой CMS нужен HTTPS. Задайте CMS_ADMIN_URL.");
}
try {
  const token = (
    await readFile(
      resolve(
        process.env.INQUIRY_DATA_DIR || resolve(root, "data/runtime"),
        "cms-setup-token",
      ),
      "utf8",
    )
  ).trim();
  if (token) url.hash = `setup=${encodeURIComponent(token)}`;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const command =
  process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
      ? null
      : "xdg-open";
if (!command) {
  console.log(
    "Откройте /admin на сайте. Ключ первого запуска находится в data/runtime/cms-setup-token.",
  );
} else {
  const child = spawn(command, [url.href], { stdio: "ignore" });
  child.on("error", () => {
    console.error("Не удалось открыть браузер. Откройте /admin на сайте.");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code || 0;
  });
}
