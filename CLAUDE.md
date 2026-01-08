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
│       │   │   ├── fact-check/       # V1 endpoint (legacy)
│       │   │   ├── fact-check-v2/    # V2 endpoint (current)
│       │   │   └── logs/
│       │   └── page.tsx
│       ├── lib/
│       │   ├── prompts.ts            # Centralized prompt management
│       │   ├── types.ts              # TypeScript interfaces
│       │   ├── source-fetcher.ts     # Article reading & authority scoring
│       │   ├── validator.ts          # Analysis validation
│       │   └── logger.ts
│       ├── test-v2.js                # Test script for V2 endpoint
│       ├── compare-v1-v2.js          # Comparison script for V1 vs V2
│       └── FACT-CHECK-V2.md          # Detailed V2 architecture docs
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
# Start dev server (runs Turbo, starts Next.js on port 3000)
npm run dev

# Or run from web app directly
cd apps/web
npm run dev
```

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

### Testing Fact-Check Endpoints
```bash
# Test V2 endpoint interactively
cd apps/web
node test-v2.js

# Compare V1 vs V2 on same post
node compare-v1-v2.js

# Test single post programmatically
node test-single.js
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

# Optional (for source gathering)
GOOGLE_API_KEY=your_google_api_key
GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id

# Future features (not yet implemented)
TWITTER_CLIENT_ID=your_twitter_client_id
TWITTER_CLIENT_SECRET=your_twitter_client_secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_nextauth_secret
DATABASE_URL=postgresql://user:password@localhost:5432/xfactchecker
```

**Note**: The fact-checker works without Google API keys, but source gathering will be limited.

## Fact-Checking Architecture

### V2 Multi-Stage Pipeline

The current V2 system uses a four-stage evidence-informed pipeline:

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

**Evidence-First Analysis**: Unlike V1 which analyzed content blindly then searched for sources, V2 gathers sources FIRST and provides them to Claude during analysis. This grounds verdicts in actual evidence.

**Claim Extraction**: Posts are decomposed into individual verifiable claims, each with its own priority level and search strategy. This enables targeted verification instead of treating posts as monolithic units.

**Smart Source Reading**: Hybrid approach using snippets for minor claims but full article extraction (via Mozilla Readability) for high-priority statistical/attribution claims.

**Temporal Context**: Post timestamps are extracted and provided to Claude, enabling verification of time-sensitive claims ("X days ago", "recently").

**Validation Layer**: Automated quality checks detect verdict-score inconsistencies, hallucinated source citations, and cases needing human review.

## TypeScript Type System

Core interfaces are defined in [apps/web/lib/types.ts](apps/web/lib/types.ts):

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

### POST /api/fact-check-v2
Current production endpoint. See [apps/web/FACT-CHECK-V2.md](apps/web/FACT-CHECK-V2.md) for complete request/response schema.

### POST /api/fact-check
Legacy V1 endpoint, kept for comparison/A/B testing.

### POST /api/logs
Endpoint for retrieving logged fact-checks (if implemented).

## Common Development Workflows

### Testing a Prompt Change
1. Modify prompt in [apps/web/lib/prompts.ts](apps/web/lib/prompts.ts)
2. Start dev server: `npm run dev`
3. Test with: `node test-v2.js` (from `apps/web/`)
4. Review logs in `apps/web/logs/fact-checks.jsonl`
5. Compare with V1 if needed: `node compare-v1-v2.js`

### Adding a New Claim Type
1. Update `Claim` interface type field in [apps/web/lib/types.ts](apps/web/lib/types.ts)
2. Update claim extraction prompt in [apps/web/lib/prompts.ts](apps/web/lib/prompts.ts)
3. Test extraction on posts containing the new type

### Modifying Validation Rules
1. Edit `validateAnalysis()` in [apps/web/lib/validator.ts](apps/web/lib/validator.ts)
2. Test on edge cases
3. Check that `needsHumanReview` triggers appropriately

### Adding New Authority Tier Sources
1. Edit `TIER_1_DOMAINS` or `TIER_2_DOMAINS` in [apps/web/lib/source-fetcher.ts](apps/web/lib/source-fetcher.ts)
2. Optionally add tier-specific logic to `scoreSourceAuthority()`
3. Test that new domains receive correct scores

## Performance Characteristics

- **V2 Average Duration**: 18-22 seconds
- **V2 Average Cost**: $0.09 per fact-check
- **V1 Average Duration**: 8-10 seconds (for comparison)
- **V1 Average Cost**: $0.055 per fact-check

V2 is 2x slower and 64% more expensive, but provides 4-5x better accuracy with significantly reduced hallucination rate.

## Known Limitations

- No database persistence (uses JSONL logs)
- No caching layer (planned)
- No user authentication (planned)
- No rate limiting (planned)
- Source gathering limited without Google API keys
- Some websites block scraping (article reading fails)
- JavaScript-heavy sites may not parse correctly with Readability

## Important Notes for AI Assistants

- **NEVER modify prompts without thorough testing** - small changes can drastically affect accuracy
- **Always update validation rules when changing scoring criteria**
- **Maintain type safety** - update TypeScript interfaces when changing response structures
- **Test both endpoints** when making pipeline changes to avoid breaking V1
- **Check logs** after testing to verify cost and performance impacts
- **Be aware of Anthropic API rate limits** when running batch tests
