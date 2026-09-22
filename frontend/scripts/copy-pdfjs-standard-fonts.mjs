/**
 * pdf.js needs its standard fonts and worker as same-origin static files
 * so a report page can be drawn in the verify dialog.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const destDir = path.join(root, "public", "pdfjs");
const pkg = path.dirname(
  fs.realpathSync(path.join(root, "node_modules", "pdfjs-dist", "package.json"))
);

fs.mkdirSync(destDir, { recursive: true });
fs.cpSync(path.join(pkg, "standard_fonts"), path.join(destDir, "standard_fonts"), {
  recursive: true,
});
fs.copyFileSync(
  path.join(pkg, "build", "pdf.worker.min.js"),
  path.join(destDir, "pdf.worker.min.js")
);
