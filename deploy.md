# Deploy Twogether (quick guide)

Short version. Full guide with diagrams and troubleshooting: [docs/14-deployment.md](docs/14-deployment.md).

## 1. Supabase (skip if already done)

1. Create a free project at [supabase.com](https://supabase.com). Pick the region nearest you and save the database password.
2. On your laptop, copy `.env.example` to `.env.local` and fill in the 5 values (where to find them: [docs/14-deployment.md, step 3](docs/14-deployment.md#3-collect-the-five-values)).
3. Run once:

   ```bash
   npm run db:setup
   ```

## 2. Vercel

1. **Add New** > **Project**, import your GitHub repository.
2. **Environment Variables**: add these 5, with the same values as your `.env.local`:

   | Name                            |
   | ------------------------------- |
   | `DATABASE_URL`                  |
   | `SUPABASE_URL`                  |
   | `SUPABASE_SERVICE_ROLE_KEY`     |
   | `NEXT_PUBLIC_SUPABASE_URL`      |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

3. **Deploy** and wait about 2 minutes.

## 3. Region (makes it fast)

1. **Settings** > **Functions** > **Function Region**: the same region as Supabase (Mumbai = `bom1`).
2. **Deployments** > **⋯** on the latest one > **Redeploy**.

## 4. Use it

Open `https://your-project.vercel.app`. On both phones: sign up, pair with the invite code, install the app, and turn on notifications in Settings.

## Updating

Every `git push` redeploys automatically:

```bash
git add .
git commit -m "what changed"
git push
```

## Something wrong?

| Problem                      | Fix                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 500 error                    | **Deployments** > latest > **Runtime Logs**. Usually a missing or wrong environment variable. Fix it, then redeploy. |
| Header stays "connecting..." | Check the two `NEXT_PUBLIC_` values, then redeploy.                                                                  |
| Site down after a quiet week | Supabase paused the project. Click **Restore project** in the Supabase dashboard.                                    |
