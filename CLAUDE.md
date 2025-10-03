# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript application that syncs GitHub starred repositories to a Raindrop.io collection. It fetches all starred repos from GitHub (including star dates and metadata) and creates corresponding bookmarks in Raindrop.io, skipping duplicates.

## Common Commands

### Build and Development
- `npm run build` - Compile TypeScript to JavaScript
- `npm run typecheck` - Type check without emitting files
- `npm run clean` - Remove compiled JavaScript files

### Running the Application
- `npm start` - Run sync once
- `npm run cron` - Start hourly cron job using `forever`
- `npm run docker` - Install, build, and run in Docker container

### Docker
- `docker compose up -d` - Run cron job in Docker (requires `.env` file with tokens)

## Architecture

### Entry Points
- **src/index.ts** - Single run entry point (loads env, calls main)
- **src/cron.ts** - Cron entry point (runs main() every hour at minute 0)
- **src/script.ts** - Alternative single run entry (used by GitHub Actions)

### Core Logic (src/main.ts)
1. Authenticates with GitHub using Octokit and Raindrop.io using axios
2. Fetches all starred repos with pagination (uses `application/vnd.github.v3.star+json` header to get `starred_at` timestamp)
3. Transforms stars into Raindrop items with:
   - Title: repo full name
   - Link: repo HTML URL
   - Tags: always includes `#github`
   - Note: language and topics in format `topics: <language>, <topic1>, <topic2>...`
   - Created date: starred_at timestamp
   - Excerpt: repo description
4. Processes in chunks of 100 repos
5. For each chunk, checks existing URLs via `/import/url/exists` endpoint
6. Only imports non-duplicate repos via `/raindrops` batch endpoint

### Environment Variables
Required environment variables (defined in `.env` or GitHub Actions secrets):
- `GH_TOKEN` - GitHub personal access token with `read:user` scope
- `RAINDROP_TOKEN` - Raindrop.io test token (from app.raindrop.io/settings/integrations)
- `RAINDROP_COLLECTION_ID` - Numeric ID of target Raindrop collection

### Deployment Options
1. **Self-hosted**: Run `npm run cron` after building
2. **Docker**: Uses Node 22 Alpine image, runs cron.js with restart on failure
3. **GitHub Actions**: Runs daily at 10:00 UTC (workflow_dispatch also enabled)

### TypeScript Configuration
- Extends `@tsconfig/node22`
- Uses ts-node with transpileOnly for faster execution
- Compiles to JavaScript for production (node runs .js files)
- All imports use `.js` extensions (ESM module resolution)
