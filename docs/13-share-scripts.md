# 13. Copy-paste setup and update scripts

`npm run share` runs `scripts/make-share.mjs`, which writes `twogether-share/` (ignored by git):

```text
twogether-share/
  twogether-setup.mjs        whole project in one file: new laptop, or update
  twogether-update.mjs       update an existing copy: also removes dropped files, runs npm install
  parts/twogether-part-N-of-M-*.mjs   the setup split into ~90 KB pieces for codeshare
  HOW-TO-SETUP.md            instructions with the real file sizes
```

## How the generator works

1. **Collect files.** It walks the project, skipping `node_modules`, `.next`, `data`, `twogether-share`, `.git`, `.env*` (except `.env.example`), `*.tsbuildinfo`, `next-env.d.ts` and the manifest file. Images are read as base64, everything else as text. Each file gets a short SHA-256 hash.
2. **Pack.** The file list becomes JSON, is gzipped, base64-encoded and wrapped at 100 characters per line, so it pastes cleanly.
3. **Write the scripts.** Each script is a template with the packed data in a `DATA` string, followed by plain Node code that unpacks it.
4. **Split into parts.** Files are placed largest first into parts until a part would exceed 90 KB of data.

## What the scripts do when you run them

**Setup / parts:**

1. Find the target folder (argument, current folder, or a `twogether` subfolder).
2. Refuse if it is a different project (a `package.json` whose name is not `twogether`) or a non-empty unrelated folder. `--force` overrides.
3. Unpack. A cut-off paste fails here with "This script is damaged".
4. Write only the files that differ, then re-hash every file to verify.
5. Record installed files in `.twogether-files.json`.

**Update** does the same but requires an existing Twogether project, then:

- removes files listed in the old `.twogether-files.json` that the new version does not have (never `.env*`, never files you created yourself). Updating an older SQLite version removes `server.ts` and the old socket files this way.
- runs `npm install` if `package.json` or `package-lock.json` changed, or `node_modules` is missing
- supports `--dry-run` (show changes only) and `--no-install`

## Your workflow

```bash
# on the main laptop, after changing code
npm run lint && npm run typecheck
npm run share
# copy twogether-share/twogether-update.mjs to the other laptop, then there:
node twogether-update.mjs
npm run dev
```

Your chats are **not** in the scripts: they live in Supabase. Copy `.env.local` to the other laptop by hand (it holds your keys), and both laptops use the same Supabase data. The `docs/` folder **is** included, so the update script also updates these docs.

Continue with [14-deployment.md](14-deployment.md).
