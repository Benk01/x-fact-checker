# X Fact-Checker

An AI-powered fact-checking application for X (Twitter) that combats misinformation through shareable, branded graphics.

## Project Structure

This is a Turborepo monorepo containing:

- `apps/web`: Next.js web application
- `packages/typescript-config`: Shared TypeScript configurations

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm >= 10.0.0

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Environment Variables

Create `.env.local` in `apps/web`:

```env
# Anthropic Claude API
ANTHROPIC_API_KEY=your_api_key_here

# Google Custom Search API
GOOGLE_API_KEY=your_google_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id

# X OAuth (for authentication)
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/xfactchecker
```

## Tech Stack

- **Framework**: Next.js 16
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **AI**: Anthropic Claude (Sonnet 4)
- **Search**: Google Custom Search API
- **Auth**: NextAuth.js with X OAuth
- **Database**: PostgreSQL
- **Graphics**: Puppeteer/Sharp
- **Monorepo**: Turborepo

## Core Features (MVP)

1. X post URL analysis
2. AI-powered fact-checking with multi-dimensional ratings
3. Source discovery and verification
4. Branded share graphics generation
5. User authentication via X OAuth
6. Rate limiting (15 checks/month free tier)
7. Challenge/correction system
8. Version tracking for fact-checks

## Development Roadmap

- [x] Monorepo setup with Turborepo
- [ ] Proof of concept (basic fact-checking)
- [ ] Database schema and ORM setup
- [ ] X post scraping implementation
- [ ] Claude API integration
- [ ] Google Custom Search integration
- [ ] Share graphics generation
- [ ] User authentication (X OAuth)
- [ ] Rate limiting
- [ ] Challenge system
- [ ] Version tracking
