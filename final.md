Use the update script. It upgrades your existing copy in place.

1. Update the code (in your existing twogether folder):


node twogether-update.mjs
Copy twogether-share/twogether-update.mjs into that folder first. It updates all files, including docs/, deletes the old server.ts and socket files, and runs npm install by itself. It should end with All 121 files verified.

2. Create a free Supabase project (one time):

Go to supabase.com and click New project.
Save the database password.
Pick the region closest to you (Mumbai if you're in India).
3. Add your keys. Copy .env.example to .env.local and fill in the 5 values. Where to find each one is in docs/14-deployment.md, step 3.

4. Create the tables and storage (one time):


npm run db:setup
It should end with "Supabase is ready".

5. Run it:


npm run dev
Open http://localhost:3000 and create the two accounts again.

Things to know:

Old chats don't carry over. Anything in the old data/ folder stays there. You can delete that folder once the new version works.
The old .env is no longer used. The app now reads .env.local.
If the page loads but buttons do nothing: you're probably running Turbopack with Console Ninja active. Use npm run dev, not dev:turbo.
To put it online: after step 5 works, follow docs/14-deployment.md from step 6 (Vercel).