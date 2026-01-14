# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

X Fact-Checker is an AI-powered fact-checking application for X (Twitter) posts that uses a multi-stage evidence-informed pipeline. The project is built as a Turborepo monorepo with a Next.js application.

**Core Technology**: The fact-checking system uses Anthropic Claude (Sonnet 4) with advanced prompt engineering techniques including few-shot examples, chain-of-thought reasoning, and evidence-first analysis.

## Repository Structure

```
x-fact-checker/
├── apps/
│   └── web/               # Next.js application
│       ├── app/
│       │   ├── api/
│       │   │   ├── fact-check/       # Legacy endpoint (V1.1)
│       │   │   ├── verify/           # Agentic endpoint with SSE streaming
│       │   │   └── logs/
│       │   └── page.tsx              # Main UI with SSE event handling
│       ├── lib/
│       │   ├── agent/                # Agentic fact-checking system
│       │   │   ├── loop.ts           # Two-phase agent orchestration
│       │   │   ├── tools.ts          # EVIDENCE_TOOLS + VERDICT_TOOL definitions
│       │   │   ├── executor.ts       # Tool execution handlers
│       │   │   └── prompts.ts        # Agent system prompt
│       │   ├── firecrawl/            # Firecrawl API wrapper
│       │   │   ├── client.ts         # Search & scrape with smart extraction
│       │   │   └── domains.ts        # Credibility tier definitions
│       │   ├── cache/                # Redis caching layer
│       │   │   └── redis.ts          # Upstash Redis client
│       │   ├── costs/                # Cost tracking
│       │   │   └── tracker.ts        # API usage & budget tracking
│       │   ├── prompts.ts            # Legacy prompts
│       │   ├── types.ts              # TypeScript interfaces
│       │   ├── source-fetcher.ts     # Legacy source fetching
│       │   ├── validator.ts          # Analysis validation
│       │   └── logger.ts
│       └── ARCHITECTURE.md           # Detailed architecture docs
└── packages/
    └── typescript-config/
```

## Development Commands

### Setup
```bash
npm install
```

### Development

```bash
# From apps/web directory:
npm run dev:status    # Show all running dev servers (ports 3000-3010)
npm run dev:stop      # Stop all dev servers
npm run dev           # Start dev server on port 3000
npx next dev -p 3001  # Start on specific port
```

**Multiple instances supported**: Both you and Claude Code can run separate dev servers on different ports (3000-3010).

**For Claude Code**:
- Check `npm run dev:status` to see what's running
- Can start servers in background - they'll be tracked with source "claude-code"
- Use `npm run dev:stop --port XXXX` to stop specific server
- Prefer using an existing server if one is already running

### Building
```bash
# Build all apps (via Turbo)
npm run build

# Or build web app directly
cd apps/web
npm run build
```

### Linting
```bash
npm run lint
```

### Testing Fact-Check Endpoint
```bash
# Test via curl (agentic endpoint)
curl -X POST http://localhost:3000/api/verify \
  -H "Content-Type: application/json" \
  -d '{"postUrl": "https://x.com/username/status/123"}'

# Or use the web UI at http://localhost:3000
```

### Code Formatting
```bash
npm run format
```

## Environment Variables

Create `.env.local` in `apps/web/`:

```env
# Required
ANTHROPIC_API_KEY=your_api_key_here

# Source Gathering (at least one recommended)
# Firecrawl - Preferred for better search quality (https://firecrawl.dev)
FIRECRAWL_API_KEY=your_firecrawl_api_key

# Google Custom Search - Fallback option
GOOGLE_API_KEY=your_google_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id

# Caching (optional but recommended)
UPSTASH_REDIS_REST_URL=your_upstash_redis_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token

# Future features (not yet implemented)
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret
DATABASE_URL=postgresql://user:password@localhost:5432/xfactchecker
```

**Note**: Firecrawl is the preferred search provider for better source quality. Falls back to Google Custom Search if Firecrawl is not configured.

## Fact-Checking Architecture

### NEW: Agentic Architecture (POST /api/verify)

The agentic system uses Claude with tool use in a **two-phase architecture**:

```
User submits X post
        ↓
   Scrape post content (enhanced)
   - Post text & timestamp
   - Author username & display name
   - Image URLs
   - Quoted post content & author
        ↓
   ══════════════════════════════════
   PHASE 1: Evidence Gathering
   ══════════════════════════════════
   Agent Loop (Haiku → Sonnet)
   ┌─────────────────────────────┐
   │  Evidence Tools:            │
   │  - search: Web search       │
   │  - scrape_url: Full content │
   │  - scrape_multiple: Batch   │
   │  - conclude: Early exit     │
   │  - request_clarification    │
   └─────────────────────────────┘
   Exit when: conclude called, max iterations, or clarification needed
        ↓
   ══════════════════════════════════
   PHASE 2: Verdict Submission
   ══════════════════════════════════
   Single API call (Sonnet)
   ┌─────────────────────────────┐
   │  - submit_verdict (forced)  │
   └─────────────────────────────┘
        ↓
   SSE Stream Events → Frontend
        ↓
   Final Verdict + Costs
```

**Key Features:**
- **Two-Phase Design**: Evidence gathering separated from verdict - guarantees a verdict is always submitted
- **Enhanced Post Extraction**: Scrapes author info, images, and quoted posts for richer context
- **Model Tiering**: Haiku for first 3 iterations (75% cheaper), Sonnet for analysis/verdict
- **Prompt Caching**: System prompt and tools cached for 5 min (reduces repeat token costs)
- **Result Compression**: Search/scrape results compressed in history to prevent token bloat
- **Smart Extraction**: Keyword-based paragraph extraction (2000 char limit per source)
- **Cost Tracking**: Budget limit ($0.25 default), tracks Claude/Search/Scrape costs
- **SSE Streaming**: Real-time updates as agent works
- **Credibility Tiers**: Sources ranked Tier 1 (gov/academic) > Tier 2 (wire/fact-checkers) > Tier 3 (news)

### Legacy: Multi-Stage Pipeline (POST /api/fact-check)

The V1.1 system uses a multi-stage evidence-informed pipeline:

```
1. Scrape Post Content & Extract Timestamp
   ↓
2. Extract Claims (Claude API)
   - Identify verifiable claims
   - Categorize by type (statistical, attribution, event, date, other)
   - Prioritize (high/medium/low)
   - Generate optimized search queries
   ↓
3. Gather Sources (Parallel)
   - Search snippets for low/medium priority
   - Full article reading for high priority claims
   - Authority scoring (10-point scale)
   ↓
4. Analyze with Evidence (Claude API)
   - Provide ALL sources to AI upfront
   - Per-claim verdicts
   - Holistic scoring (factual accuracy, context, source quality)
   - Chain-of-thought reasoning
   ↓
5. Validate Results
   - Verdict-score consistency
   - Source citation verification (detect hallucinations)
   - Confidence calibration
   - Flag for human review if needed
```

### Key Architectural Patterns

**Evidence-First Analysis**: Sources are gathered FIRST and provided to Claude during analysis. This grounds verdicts in actual evidence rather than allowing post-hoc rationalization.

**Claim Extraction**: Posts are decomposed into individual verifiable claims, each with its own priority level and search strategy. This enables targeted verification instead of treating posts as monolithic units.

**Smart Source Reading**: Hybrid approach using snippets for minor claims but full article extraction (via Mozilla Readability) for high-priority statistical/attribution claims.

**Temporal Context**: Post timestamps are extracted and provided to Claude, enabling verification of time-sensitive claims ("X days ago", "recently").

**Enhanced Post Context**: The agent receives rich context including:
- Author username and display name (`POSTED BY: @username (Display Name)`)
- Image count indicator (`MEDIA: N images`)
- Quoted post content with attribution (if present)

**Validation Layer**: Automated quality checks detect verdict-score inconsistencies, hallucinated source citations, and cases needing human review.

## TypeScript Type System

Core interfaces are defined in [apps/web/lib/types.ts](apps/web/lib/types.ts):

- `ExtractedXPost`: Scraped X post with author, media, quoted post, and timestamp
- `Claim`: Individual verifiable claim with type, priority, search query
- `ClaimExtractionResult`: Extracted claims plus post metadata (tone, type)
- `SourceSnippet`: Search result snippet
- `DeepSource`: Full article with authority score and relevant passages
- `FactCheckAnalysis`: Complete analysis with per-claim verdicts and holistic scores
- `ValidationResult`: Validation issues, warnings, human review flag
- `FactCheckResult`: Complete fact-check response structure

When modifying the pipeline, update these types to maintain type safety across the system.

## Prompt Engineering

All prompts are centralized in [apps/web/lib/prompts.ts](apps/web/lib/prompts.ts).

### Prompt Architecture
- **SYSTEM_PROMPT**: Core fact-checker identity and anti-hallucination instructions
- **FEW_SHOT_EXAMPLES**: Two comprehensive examples showing perfect fact-checks
- **CLAIM_EXTRACTION_PROMPT**: Structured claim extraction with prioritization guidelines
- **ANALYSIS_PROMPT**: Evidence-informed analysis with scoring rubrics

### Critical Prompt Patterns
- **Anti-hallucination**: "ONLY cite sources from the EVIDENCE SOURCES section provided - never make up or hallucinate sources"
- **Chain-of-thought**: "Explain your reasoning step-by-step"
- **Few-shot learning**: Examples show exact output format expected
- **Explicit rubrics**: Each score (1-10) has detailed description

When modifying prompts:
1. Update temperature settings appropriately (0.2 for analysis, 0.3 for extraction)
2. Test on multiple posts before deployment
3. Monitor token usage in logs
4. Update few-shot examples if output format changes

## Source Authority Scoring

Authority scoring is implemented in [apps/web/lib/source-fetcher.ts](apps/web/lib/source-fetcher.ts):

- **Tier 1 (Score 10)**: Government agencies (CDC, FDA, WHO), fact-checkers (Snopes, PolitiFact), academic sources (.edu, pubmed), wire services (AP, Reuters, BBC)
- **Tier 2 (Score 8)**: Major newspapers (NYT, WSJ, Guardian), news orgs (NPR, PBS, CNN)
- **Tier 3 (Score 5)**: Default for unknown domains

To add new authoritative sources, update `TIER_1_DOMAINS` or `TIER_2_DOMAINS` arrays.

## Validation System

Automated validation runs on every fact-check in [apps/web/lib/validator.ts](apps/web/lib/validator.ts):

### Validation Checks
1. **Verdict-Score Consistency**: "Accurate" requires factualAccuracy >= 8, "False" requires <= 3
2. **Source Citation**: Detects URLs mentioned in analysis but not in provided sources (hallucinations)
3. **Confidence Calibration**: Warns on low confidence with strong verdicts, or high confidence with few sources
4. **Completeness**: Non-"Accurate" verdicts must have keyIssues, reasoning must be >= 50 chars

### Human Review Triggers
- Confidence < 70%
- Factual accuracy score 4-6 (borderline)
- Verdict is "Unverifiable"
- Validation issues detected
- Fewer than 2 sources found

## Logging and Monitoring

All fact-checks are logged to `apps/web/logs/fact-checks.jsonl` with:
- Full request/response
- Performance metrics (per-stage timing)
- Cost breakdown (Claude API usage)
- Validation results

Log format is newline-delimited JSON for easy parsing.

## API Endpoints

### POST /api/verify (Recommended)
Agentic fact-checking endpoint with SSE streaming. Returns events as the agent works.

**Request:**
```json
{ "postUrl": "https://x.com/username/status/123" }
```

**SSE Events:**
- `status` - Progress updates
- `post_content` - Scraped post content with enhanced data:
  - `content`: Post text
  - `timestamp`: ISO timestamp
  - `author`: `{ username, displayName }`
  - `media`: `{ images: string[] }`
  - `quotedPost`: `{ text, author, url }` (if present)
- `thinking` - Agent iteration start
- `tool_call` - Tool being called
- `tool_result` - Tool result
- `verdict` - Final verdict submitted
- `complete` - Fact-check complete with full result

### POST /api/fact-check (Legacy)
V1.1 evidence-informed multi-stage pipeline. See [apps/web/ARCHITECTURE.md](apps/web/ARCHITECTURE.md) for details.

## Common Development Workflows

### Testing Agent Changes
1. Start dev server: `npm run dev`
2. Use web UI at http://localhost:3000 or curl the /api/verify endpoint
3. Watch server logs for iteration details, token usage, and costs
4. Look for Phase 1/Phase 2 transitions and verdict submission

### Modifying Agent Tools
1. Edit tool definitions in [apps/web/lib/agent/tools.ts](apps/web/lib/agent/tools.ts)
2. Add handler in [apps/web/lib/agent/executor.ts](apps/web/lib/agent/executor.ts)
3. Update EVIDENCE_TOOLS or VERDICT_TOOL as needed
4. Test with posts that would trigger the new tool

### Adjusting Cost/Performance
1. Edit DEFAULT_CONFIG in [apps/web/lib/agent/loop.ts](apps/web/lib/agent/loop.ts):
   - `maxIterations`: More iterations = more thorough but costlier
   - `maxSearches`: Limit search API calls
   - `maxCostUsd`: Budget limit before abort
2. Adjust Haiku/Sonnet cutoff (currently iteration < 3 uses Haiku)
3. Tune MAX_CONTENT_LENGTH in [apps/web/lib/firecrawl/client.ts](apps/web/lib/firecrawl/client.ts)

### Adding New Credibility Tiers
1. Edit [apps/web/lib/firecrawl/domains.ts](apps/web/lib/firecrawl/domains.ts)
2. Add domains to TIER_1_DOMAINS or TIER_2_DOMAINS
3. Test that new domains receive correct tier in search results

## Performance Characteristics

### Agentic System (POST /api/verify)
- **Average Duration**: 35-55 seconds
- **Average Cost**: $0.08-0.13 per fact-check
  - Claude: $0.07-0.12 (Haiku + Sonnet combined)
  - Search: $0.01 (5 searches max)
  - Scrape: $0.002-0.003 per source
- **Iterations**: 4-8 evidence gathering + 1 verdict
- **Guaranteed Verdict**: Two-phase design ensures verdict always submitted

### Legacy System (POST /api/fact-check)
- **Average Duration**: 18-22 seconds
- **Average Cost**: $0.09-0.10 per fact-check
- **Accuracy**: Significantly improved through evidence-first approach
- **Hallucination Rate**: ~10% (estimated)

## Known Limitations

- No database persistence (uses JSONL logs)
- No user authentication (planned)
- No rate limiting (planned)
- Some websites block scraping (article reading fails)
- JavaScript-heavy sites may not parse correctly with Readability
- Agent may use all iterations on complex multi-part claims

## Important Notes for AI Assistants

- **Kill existing node processes** before starting new dev server to avoid port conflicts
- **Watch server logs** for detailed iteration info, model usage (Haiku/Sonnet), and costs
- **Two-phase architecture**: Evidence gathering (Phase 1) → Forced verdict (Phase 2)
- **Token optimization**: Results are compressed in conversation history
- **Cache hit indicators**: Look for 💾 in logs showing prompt cache usage
- **Model indicators**: 🐇 = Haiku (cheap), 🎭 = Sonnet (analysis)
- **Maintain type safety** - update TypeScript interfaces when changing tool definitions
- **Test cost impact** - check final stats in logs for Claude/Search/Scrape breakdown
- **Be aware of Anthropic API rate limits** when running multiple tests
