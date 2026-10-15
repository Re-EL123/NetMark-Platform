# NetMark Platform

A full platform for network marketing built as a monorepo.

## Architecture

- **apps/web**: Frontend (Vite) deployable to GitHub Pages
- **apps/api**: Vercel Serverless API (<= 12 functions)
- **packages/shared**: Shared types and constants

## Roles

- **platformAdmin**: Global platform administrator (replaces superAdmin)
- **owner**: Company/organisation scoped administrator (what superAdmin did, scoped to their own company)
- **distributor**: Distributor user
- **storeOwner**: Store owner
- **customer**: Customer
- **driver**: Driver

## Authentication

Single role-based login using Firebase Authentication. Role routing after authentication.

## Development

```bash
# Install dependencies
npm install

# Build shared package
npm run build -w @netmark/shared

# Web dev
npm run dev -w @netmark/web

# API dev (requires Vercel CLI)
npm run dev -w @netmark/api
```

## Deployment

- Frontend: GitHub Pages via `.github/workflows/deploy.yml`
- API: Vercel Serverless Functions
