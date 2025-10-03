# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript application that syncs GitHub starred repositories to a Raindrop.io collection. It:
1. Fetches all starred repos from GitHub (including star dates and metadata)
2. Archives them to a local JSON file (`data/starred-repos.json`)
3. Creates corresponding bookmarks in Raindrop.io, skipping duplicates
4. Removes unstarred repos from both Raindrop.io and the local archive
5. Automatically commits archive changes to git

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

### Core Modules

#### src/archiver.ts
Handles local archiving and git operations:
- `fetchStarsFromGitHub()` - Fetches all starred repos using Octokit pagination with `application/vnd.github.v3.star+json` header
- `archiveStars()` - Main archiving function that:
  - Loads existing stars from `data/starred-repos.json`
  - Fetches current stars from GitHub
  - Identifies new stars and unstarred repos (repos in archive but not in current stars)
  - Saves all current stars sorted by `starred_at` (descending) to JSON file
  - Commits changes to git with message format: `Archive: +N starred, -M unstarred (YYYY-MM-DD)`
  - Returns both current stars and unstarred repos for cleanup
- Configures git user identity as `github-actions[bot]` before committing

#### src/main.ts
Main sync orchestration:
1. Calls `archiveStars()` to archive stars locally and get current/unstarred repos
2. Transforms stars into Raindrop items with:
   - Title: repo full name
   - Link: repo HTML URL
   - Tags: always includes `#github`
   - Note: language and topics in format `topics: <language>, <topic1>, <topic2>...`
   - Created date: starred_at timestamp
   - Excerpt: repo description
3. Processes in chunks of 100 repos
4. For each chunk, checks existing URLs via `/import/url/exists` endpoint
5. Only imports non-duplicate repos via `/raindrops` batch endpoint
6. Deletes unstarred repos from Raindrop.io by:
   - Searching for each unstarred repo URL in the collection
   - Finding exact URL match
   - Deleting the raindrop via `/raindrop/{id}` endpoint

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
