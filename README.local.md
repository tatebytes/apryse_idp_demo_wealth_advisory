# Running Locally

## Required Environment Variables

Create a `.env` file in the project root with the following variables:

```
# Database — MySQL connection string
DATABASE_URL=mysql://root@localhost:3306/apryse_demo

# Auth — any random 32+ character string
JWT_SECRET=replace-with-a-long-random-string

# Manus OAuth — leave empty for local dev (login won't work locally)
VITE_APP_ID=
OAUTH_SERVER_URL=
VITE_OAUTH_PORTAL_URL=
OWNER_OPEN_ID=
OWNER_NAME=

# Apryse License Keys
# Server-side extraction (falls back to mock data if empty)
APRYSE_LICENSE_KEY=

# Client-side WebViewer (trial mode / watermark if empty)
VITE_APRYSE_LICENSE_KEY=

# LLM — point to any OpenAI-compatible endpoint
# OpenAI:  BUILT_IN_FORGE_API_URL=https://api.openai.com
# Gemini:  BUILT_IN_FORGE_API_URL=https://generativelanguage.googleapis.com/v1beta/openai
# Also update model name in server/_core/llm.ts if not using Gemini
BUILT_IN_FORGE_API_URL=
BUILT_IN_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_KEY=
VITE_FRONTEND_FORGE_API_URL=
```

## Setup Steps

```bash
# 1. Install dependencies (must use pnpm, not npm)
pnpm install

# 2. Create the database
mysql -u root -e "CREATE DATABASE IF NOT EXISTS apryse_demo;"

# 3. Push the schema
pnpm db:push

# 4. Start the dev server
pnpm dev
```

Open http://localhost:3000

## Notes

- **Apryse license key:** Without `APRYSE_LICENSE_KEY`, server-side PDF extraction falls back to mock data automatically. Without `VITE_APRYSE_LICENSE_KEY`, the WebViewer runs in trial mode with a watermark.
- **LLM model name:** The server uses `gemini-2.5-flash` by default. If pointing at OpenAI, change the model to `gpt-4o-mini` in `server/_core/llm.ts`.
- **Manus OAuth:** Login via Manus OAuth only works on the deployed Manus domain. Locally, you can access dashboard routes directly without logging in if auth guards allow it.
