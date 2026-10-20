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
const SKIP_FILES = new Set(["next-env.d.ts", ".DS_Store", "npm-debug.log", ".twogether-files.json"]);
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

const MANIFEST = ".twogether-files.json";
/** Files from older versions that the update script deletes even if no manifest recorded them. */
const OBSOLETE = ["server.ts", "src/server/socket.ts", "src/server/files.ts"];
const TOP_LEVEL = JSON.stringify([...new Set(files.map((f) => f.p.split("/")[0]))].sort());

function script({ title, list, data }) {
  return `#!/usr/bin/env node
// Twogether - ${title} (${list.length} files).
// New laptop: put this file in an empty folder and run  node <this file>  (then follow the printed steps)
// Existing project: run it inside the project folder (the one with package.json and src) to update it.
// Needs Node.js 20.9 or newer.
// Top-level names in the Twogether project, so a folder where only some parts have run is still accepted.
const PROJECT_ENTRIES = new Set(${TOP_LEVEL});
const DATA = \`
${data}
\`;

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
// Files from older versions that would break this one (e.g. the old custom server).
for (const p of ${JSON.stringify(OBSOLETE)}) {
  if (existsSync(join(target, p))) {
    rmSync(join(target, p), { force: true });
    console.log("  removed old " + p);
  }
}
// Remember which files came from these scripts, so twogether-update.mjs can remove ones that later versions drop.
const manifestPath = join(target, "${MANIFEST}");
let known = [];
try {
  known = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {}
writeFileSync(manifestPath, JSON.stringify([...new Set([...known, ...payload.files.map((f) => f.p)])].sort(), null, 1) + "\\n");
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 9)) console.warn("\\nNote: Twogether needs Node.js 20.9+ to run. You have " + process.versions.node + ".");
const hasEnv = existsSync(join(target, ".env.local")) || existsSync(join(target, ".env"));
console.log("\\nNext:");
console.log("  1. npm ci");
if (!hasEnv) console.log("  2. Copy .env.example to .env.local and fill in your Supabase values (docs/14-deployment.md, step 3)");
if (!hasEnv) console.log("  3. npm run db:setup   (only once per Supabase project)");
console.log("  " + (hasEnv ? "2" : "4") + ". npm run dev   and open http://localhost:3000");
`;
}

/** Update-only script: syncs an existing project, removes files dropped since, reinstalls packages if needed. */
function updateScript({ list, data }) {
  return `#!/usr/bin/env node
// Twogether - UPDATE (${list.length} files). Brings an existing Twogether project up to this version.
// Run inside the project folder:  node twogether-update.mjs      (or pass the folder path)
// Keeps your .env.local (Supabase keys). Your chats live in Supabase, not in these files. Options: --no-install, --dry-run
const DATA = \`
${data}
\`;

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const noInstall = args.includes("--no-install");
const pathArg = args.find((a) => !a.startsWith("--"));

const isTwogether = (dir) => {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).name === "twogether" && existsSync(join(dir, "src"));
  } catch {
    return false;
  }
};
let target = pathArg ? resolve(pathArg) : process.cwd();
if (!pathArg && !isTwogether(target) && isTwogether(join(target, "twogether"))) target = join(target, "twogether");
if (!isTwogether(target)) {
  console.error("Could not find the Twogether project in: " + target);
  console.error("Run this inside the project folder (the one with package.json and src), or pass its path.");
  console.error("Setting up a new laptop? Use twogether-setup.mjs instead.");
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(gunzipSync(Buffer.from(DATA.replace(/\\s+/g, ""), "base64")).toString("utf8"));
} catch {
  console.error("This script is damaged (the paste was probably cut off or changed). Copy it again in full.");
  process.exit(1);
}

console.log("Twogether - update" + (dryRun ? " (dry run, nothing is changed)" : "") + "\\nProject: " + target + "\\n");
const read = (p) => (existsSync(join(target, p)) ? readFileSync(join(target, p)) : null);
const before = { pkg: read("package.json"), lock: read("package-lock.json") };

let written = 0, unchanged = 0, removed = 0;
for (const f of payload.files) {
  const dest = join(target, f.p);
  const data = Buffer.from(f.c, f.e);
  if (existsSync(dest) && readFileSync(dest).equals(data)) {
    unchanged++;
    continue;
  }
  written++;
  console.log("  " + (existsSync(dest) ? "updated" : "added  ") + "  " + f.p);
  if (dryRun) continue;
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, data);
}

// Remove files an earlier version installed that this version no longer has. Only files listed in the
// manifest (or known files from older versions) are touched, so your own files and .env are never deleted.
const manifestPath = join(target, "${MANIFEST}");
let previous = [];
try {
  previous = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {}
const OBSOLETE = ${JSON.stringify(OBSOLETE)};
const current = new Set(payload.files.map((f) => f.p));
for (const p of [...new Set([...previous, ...OBSOLETE])]) {
  if (current.has(p) || p.startsWith("data/") || p.startsWith(".env")) continue;
  const dest = join(target, p);
  if (!existsSync(dest)) continue;
  removed++;
  console.log("  removed  " + p);
  if (dryRun) continue;
  rmSync(dest, { force: true });
  // tidy up folders left empty
  for (let dir = dirname(dest); dir.length > target.length; dir = dirname(dir)) {
    try {
      if (readdirSync(dir).length) break;
      rmdirSync(dir);
    } catch {
      break;
    }
  }
}

if (dryRun) {
  console.log("\\nDry run: " + written + " to write, " + removed + " to remove, " + unchanged + " already up to date.");
  process.exit(0);
}
writeFileSync(manifestPath, JSON.stringify([...current].sort(), null, 1) + "\\n");

const bad = payload.files.filter((f) => {
  const dest = join(target, f.p);
  return !existsSync(dest) || createHash("sha256").update(readFileSync(dest)).digest("hex").slice(0, 16) !== f.h;
});
console.log("\\nDone: " + written + " written, " + removed + " removed, " + unchanged + " already up to date.");
if (bad.length) {
  console.error("WARNING: these files did not verify: " + bad.map((f) => f.p).join(", "));
  process.exit(1);
}
console.log("All " + payload.files.length + " files verified.");

const depsChanged = !before.pkg?.equals(read("package.json")) || !before.lock?.equals(read("package-lock.json"));
const missingModules = !existsSync(join(target, "node_modules"));
if ((depsChanged || missingModules) && !noInstall) {
  console.log("\\nPackages changed, running npm install...\\n");
  const r = spawnSync("npm install --no-audit --no-fund", { cwd: target, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error("\\nnpm install failed. Run it yourself in " + target);
    process.exit(1);
  }
} else if (depsChanged) {
  console.log("\\nPackages changed: run  npm install");
}
console.log("\\nUpdated. Restart the app:  npm run dev   (production: npm run build, then npm start)");
`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "parts"), { recursive: true });

// One full file.
const fullData = pack(files);
writeFileSync(join(OUT, "twogether-setup.mjs"), script({ title: "full setup / update", list: files, data: fullData }));
writeFileSync(join(OUT, "twogether-update.mjs"), updateScript({ list: files, data: fullData }));

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

These scripts contain the whole project (code **and** the \`docs/\` folder, compressed), so they work for a fresh
setup and for updating any older copy. Generated ${new Date().toISOString().slice(0, 10)} with \`npm run share\` (${files.length} files).

Requires **Node.js 20.9 or newer** (\`node -v\`) and a free **Supabase** project (see \`docs/14-deployment.md\`).

## Update a laptop that already has Twogether (${kb(statSync(join(OUT, "twogether-update.mjs")).size)})

1. Copy \`twogether-update.mjs\` into the project folder (the one with \`package.json\` and \`src\`).
2. Run:

\`\`\`bash
node twogether-update.mjs
npm run dev
\`\`\`

It updates changed files (docs included), removes files this version no longer uses (including the old
\`server.ts\` from the SQLite version), and runs \`npm install\` by itself when packages changed.
\`.env.local\` is kept. Add \`--dry-run\` to only see what would change.

**Coming from the old SQLite version?** After updating, do the one-time Supabase setup: copy \`.env.example\` to
\`.env.local\`, fill in your Supabase values, then \`npm run db:setup\`. Old chats in \`data/twogether.db\` are not
moved to Supabase.

## New laptop - one file (${kb(fullSize)})

1. Create an empty folder (e.g. \`twogether\`) and copy \`twogether-setup.mjs\` into it.
2. In a terminal in that folder:

\`\`\`bash
node twogether-setup.mjs
npm ci
\`\`\`

3. Copy \`.env.local\` from your main laptop (same Supabase data), **or** copy \`.env.example\` to \`.env.local\` and fill it
   in for a new Supabase project, then run \`npm run db:setup\` once.
4. \`npm run dev\` and open http://localhost:3000.

## New laptop - ${parts.length} smaller parts (easier to paste through codeshare)

| Part | Size | Contains |
| --- | --- | --- |
${partRows}

For each part: paste it into a new file with exactly the same name in the project folder, then run it, e.g.
\`node ${partNames[0]}\`. Parts can run in any order, but run all ${parts.length}. Each ends with \`All N files verified.\`
Then continue with steps 2-4 above.

## Troubleshooting

- \`This script is damaged\` or \`SyntaxError: Unterminated template literal\`: the paste was cut off. Copy that file again in full.
- \`This folder has a package.json for "..."\`: you are in another project. \`cd\` into an empty folder or the Twogether
  folder, or pass the path: \`node twogether-setup.mjs "C:\\\\path\\\\to\\\\twogether"\`.
- \`npm ci\` fails: delete \`node_modules\` and try again, or use \`npm install\`.
- The page loads but buttons do nothing in \`npm run dev\`: see "Why dev uses webpack" in \`docs/02-running-the-app.md\`.

## Not included

- \`node_modules\`, \`.next\` (rebuilt by npm and Next.js)
- \`.env.local\` / \`.env\` (your keys: copy by hand, never paste them anywhere public; \`.env.example\` is included)
- Your chats and photos: they live in Supabase, not in files

Delete the setup files from the project folder afterwards. This \`twogether-share\` folder is ignored by git.
`,
);

console.log(`Wrote ${OUT}`);
console.log(`  twogether-setup.mjs  ${kb(fullSize)}  (${files.length} files)`);
console.log(`  twogether-update.mjs  ${kb(statSync(join(OUT, "twogether-update.mjs")).size)}`);
partNames.forEach((n, i) => console.log(`  parts/${n}  ${kb(statSync(join(OUT, "parts", n)).size)}  (${parts[i].length} files)`));
