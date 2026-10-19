#!/usr/bin/env node
// Builds copy-paste setup scripts for the whole project into twogether-share/:
//   twogether-setup.mjs           one file with everything (new laptop or update)
//   parts/twogether-part-N-of-M   the same content split into paste-sized pieces
//   HOW-TO-SETUP.md               instructions
// Run: npm run share
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const OUT = join(ROOT, "twogether-share");
const PART_LIMIT = 90 * 1024; // max base64 payload per part, so each part pastes cleanly into codeshare

const SKIP_DIRS = new Set(["node_modules", ".next", "out", "build", "data", "twogether-share", ".git", ".vercel", "coverage"]);
const SKIP_FILES = new Set(["next-env.d.ts", ".DS_Store", "npm-debug.log"]);
const isSkipped = (name) => SKIP_FILES.has(name) || name.endsWith(".tsbuildinfo") || (name.startsWith(".env") && name !== ".env.example");
const BINARY = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".mp3", ".wav"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...walk(join(dir, entry.name)));
    } else if (entry.isFile() && !isSkipped(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const files = walk(ROOT)
  .map((abs) => {
    const p = relative(ROOT, abs).split(sep).join("/");
    const buf = readFileSync(abs);
    const binary = BINARY.has(extname(p).toLowerCase());
    return {
      p,
      e: binary ? "base64" : "utf8",
      c: buf.toString(binary ? "base64" : "utf8"),
      h: createHash("sha256").update(buf).digest("hex").slice(0, 16),
      size: statSync(abs).size,
    };
  })
  .sort((a, b) => a.p.localeCompare(b.p));

const pack = (list) =>
  gzipSync(Buffer.from(JSON.stringify({ files: list.map(({ p, e, c, h }) => ({ p, e, c, h })) })), { level: 9 })
    .toString("base64")
    .replace(/.{100}/g, "$&\n");

const TOP_LEVEL = JSON.stringify([...new Set(files.map((f) => f.p.split("/")[0]))].sort());

function script({ title, list, data }) {
  return `#!/usr/bin/env node
// Twogether - ${title} (${list.length} files).
// New laptop: put this file in an empty folder and run  node <this file>  then  npm ci  and  npm run dev
// Existing project: run it inside the project folder (the one with package.json and src) to update it.
// Needs Node.js 22.13 or newer.
// Top-level names in the Twogether project, so a folder where only some parts have run is still accepted.
const PROJECT_ENTRIES = new Set(${TOP_LEVEL});
const DATA = \`
${data}
\`;

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const args = process.argv.slice(2);
const force = args.includes("--force");
const pathArg = args.find((a) => !a.startsWith("--"));

let target = pathArg ? resolve(pathArg) : process.cwd();
if (!pathArg && !existsSync(join(target, "package.json")) && existsSync(join(target, "twogether", "package.json"))) target = join(target, "twogether");

// Refuse to write over a different project by mistake.
const pkgPath = join(target, "package.json");
if (existsSync(pkgPath) && !force) {
  let name = "";
  try {
    name = JSON.parse(readFileSync(pkgPath, "utf8")).name;
  } catch {}
  if (name !== "twogether") {
    console.error("This folder has a package.json for \\"" + name + "\\", not Twogether: " + target);
    console.error("Run this in an empty folder or in the Twogether project, or add --force.");
    process.exit(1);
  }
}
if (!existsSync(pkgPath) && existsSync(target) && readdirSync(target).some((f) => !f.endsWith(".mjs") && !PROJECT_ENTRIES.has(f)) && !force) {
  console.error("This folder is not empty and is not the Twogether project: " + target);
  console.error("Use an empty folder, pass the project path as an argument, or add --force.");
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(gunzipSync(Buffer.from(DATA.replace(/\\s+/g, ""), "base64")).toString("utf8"));
} catch {
  console.error("This script is damaged (the paste was probably cut off or changed). Copy it again in full.");
  process.exit(1);
}

console.log("Twogether - ${title}\\nFolder: " + target + "\\n");
let written = 0, unchanged = 0;
for (const f of payload.files) {
  const dest = join(target, f.p);
  const data = Buffer.from(f.c, f.e);
  if (existsSync(dest) && readFileSync(dest).equals(data)) {
    unchanged++;
    continue;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, data);
  written++;
  console.log("  wrote  " + f.p);
}
const bad = payload.files.filter((f) => {
  const dest = join(target, f.p);
  return !existsSync(dest) || createHash("sha256").update(readFileSync(dest)).digest("hex").slice(0, 16) !== f.h;
});
console.log("\\nDone: " + written + " written, " + unchanged + " already up to date.");
if (bad.length) {
  console.error("WARNING: these files did not verify: " + bad.map((f) => f.p).join(", "));
  process.exit(1);
}
console.log("All " + payload.files.length + " files verified.");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) console.warn("\\nNote: Twogether needs Node.js 22.13+ to run. You have " + process.versions.node + ".");
console.log("\\nNext: npm ci   then   npm run dev   (open http://localhost:3000)");
`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "parts"), { recursive: true });

// One full file.
const fullData = pack(files);
writeFileSync(join(OUT, "twogether-setup.mjs"), script({ title: "full setup / update", list: files, data: fullData }));

// Parts: greedily fill each part up to the size limit (largest files first, so big ones get their own part).
const parts = [];
for (const f of [...files].sort((a, b) => b.c.length - a.c.length)) {
  let placed = false;
  for (const part of parts) {
    if (pack([...part, f]).length <= PART_LIMIT) {
      part.push(f);
      placed = true;
      break;
    }
  }
  if (!placed) parts.push([f]);
}
parts.forEach((p) => p.sort((a, b) => a.p.localeCompare(b.p)));
const describe = (list) => {
  if (list.some((f) => f.p === "package-lock.json")) return "lockfile";
  if (list.every((f) => f.e === "base64")) return "icons";
  return "code";
};
const partNames = parts.map((list, i) => `twogether-part-${i + 1}-of-${parts.length}-${describe(list)}.mjs`);
parts.forEach((list, i) => {
  writeFileSync(join(OUT, "parts", partNames[i]), script({ title: `part ${i + 1} of ${parts.length}`, list, data: pack(list) }));
});

const kb = (n) => `${Math.round(n / 1024)} KB`;
const fullSize = statSync(join(OUT, "twogether-setup.mjs")).size;
const partRows = partNames
  .map((n, i) => `| \`${n}\` | ${kb(statSync(join(OUT, "parts", n)).size)} | ${parts[i].length} files${parts[i].length <= 3 ? ": " + parts[i].map((f) => f.p).join(", ") : ""} |`)
  .join("\n");

writeFileSync(
  join(OUT, "HOW-TO-SETUP.md"),
  `# Twogether - set up or update on another laptop

These scripts contain the whole project (compressed), so they work for a fresh setup and for updating any older copy.
Generated ${new Date().toISOString().slice(0, 10)} with \`npm run share\` (${files.length} files).

Requires **Node.js 22.13 or newer** (\`node -v\`).

## Option A - one file (${kb(fullSize)})

1. New laptop: create an empty folder (e.g. \`twogether\`). Existing copy: use the project folder.
2. Copy \`twogether-setup.mjs\` into it.
3. In a terminal in that folder run:

\`\`\`bash
node twogether-setup.mjs
npm ci
npm run dev
\`\`\`

It should print \`All ${files.length} files verified.\` Then open http://localhost:3000.

## Option B - ${parts.length} smaller parts (easier to paste through codeshare)

| Part | Size | Contains |
| --- | --- | --- |
${partRows}

For each part: paste it into a new file with exactly the same name in the project folder, then run it, e.g.
\`node ${partNames[0]}\`. Parts can run in any order, but run all ${parts.length}. Each ends with \`All N files verified.\`
Then run \`npm ci\` and \`npm run dev\`.

## Troubleshooting

- \`This script is damaged\` or \`SyntaxError: Unterminated template literal\`: the paste was cut off. Copy that file again in full.
- \`This folder has a package.json for "..."\`: you are in another project. \`cd\` into an empty folder or the Twogether
  folder, or pass the path: \`node twogether-setup.mjs "C:\\path\\to\\twogether"\`.
- \`npm ci\` fails: delete \`node_modules\` and try again, or use \`npm install\`.

## Not included

- \`node_modules\`, \`.next\` (rebuilt by npm and Next.js)
- \`data/\` (your database and uploaded photos stay on the original machine)
- \`.env\` (copy it by hand if you made one; \`.env.example\` is included)

Delete the setup files from the project folder afterwards. This \`twogether-share\` folder is ignored by git.
`,
);

console.log(`Wrote ${OUT}`);
console.log(`  twogether-setup.mjs  ${kb(fullSize)}  (${files.length} files)`);
partNames.forEach((n, i) => console.log(`  parts/${n}  ${kb(statSync(join(OUT, "parts", n)).size)}  (${parts[i].length} files)`));
