# ClipForge production deployment

## Architecture

`Browser -> Vercel (Next.js frontend) -> HTTPS FastAPI service -> FFmpeg / faster-whisper -> persistent /data volume + Supabase metadata`

The Python video service cannot run as a normal Vercel serverless function. It needs a long-running Docker host with FFmpeg, enough CPU/RAM for Whisper, and a persistent volume mounted at `/data`. A temporary Cloudflare tunnel is useful only for development and is not a production backend.

## Vercel variables

Set these for Preview and Production:

```dotenv
NEXT_PUBLIC_SITE_URL=https://YOUR_FRONTEND.vercel.app
NEXT_PUBLIC_API_URL=https://YOUR_BACKEND_HOST/api
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

`NEXT_PUBLIC_API_URL` must be HTTPS and must never point to localhost or a temporary tunnel in production.

## Backend variables

```dotenv
CLIPFORGE_ENV=production
CLIPFORGE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
CLIPFORGE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
CLIPFORGE_CORS_ORIGINS=https://YOUR_FRONTEND.vercel.app
CLIPFORGE_MEDIA_SIGNING_SECRET=GENERATE_A_LONG_RANDOM_SECRET
CLIPFORGE_OWNER_USER_IDS=YOUR_SUPABASE_USER_ID
CLIPFORGE_OWNER_EMAILS=YOUR_OWNER_EMAIL
CLIPFORGE_DATABASE_PATH=/data/database/clipforge.db
CLIPFORGE_STORAGE_PATH=/data/storage
CLIPFORGE_WHISPER_CPU_MODEL=base
```

The host must preserve `/data`. Start command outside Docker:

```sh
uvicorn backend.main:app --host 0.0.0.0 --port "$PORT"
```

## Supabase Auth

- Site URL: the stable production frontend URL.
- Redirect URLs: `https://YOUR_FRONTEND.vercel.app/auth/callback`, the Vercel preview wildcard if previews are used, and `http://localhost:5173/auth/callback` for development.
- Email confirmation: enabled.
- Custom SMTP: use `smtp.gmail.com`, port `465`, the complete Gmail address as username, and a Google app password. The Vercel URL is not an SMTP host.

Never commit a Gmail app password, Supabase service-role key, or media-signing secret.
