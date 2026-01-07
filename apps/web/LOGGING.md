# Fact-Check Logging System

## Overview

Every fact-check is automatically logged to `logs/fact-checks.jsonl` in **JSON Lines** format (one JSON object per line). This makes it easy to parse, search, and analyze logs programmatically.

## Log Storage

**Location:** `apps/web/logs/fact-checks.jsonl`

**Format:** JSON Lines (JSONL)
- Each line is a valid JSON object
- One fact-check per line
- Easy to grep, parse, and process with standard tools

## Log Structure

Each log entry contains:

```typescript
{
  id: string,                    // Unique ID (e.g., "fc_1704643200000_abc123")
  timestamp: string,              // ISO 8601 timestamp
  postUrl: string,                // X post URL
  postContent: string,            // Full text content of the post
  contentLength: number,          // Character count
  analysis: {
    factualAccuracy: number,      // 0-10 scale
    contextScore: number,         // 0-10 scale
    sourceQuality: number,        // 0-10 scale
    confidence: number,           // 0-100 percentage
    verdict: string,              // "Accurate", "Misleading", "False", etc.
    summary: string,              // 2-3 sentence analysis
    keyIssues: string[]           // List of identified problems
  },
  sources: [
    {
      title: string,
      url: string,
      snippet: string
    }
  ],
  metadata: {
    scrapeDurationMs: number,
    analysisDurationMs: number,
    searchDurationMs: number,
    totalDurationMs: number,
    anthropicTokensUsed: {
      input: number,
      output: number
    },
    cost: {
      scraping: number,
      analysis: number,
      search: number,
      total: number
    }
  },
  success: boolean,
  errorMessage?: string           // Only present if success = false
}
```

## Accessing Logs

### Via API

```bash
# Get all logs with statistics
GET /api/logs

# Get only statistics
GET /api/logs?stats=true

# Clear all logs
DELETE /api/logs
```

### Programmatically

```typescript
import { FactCheckLogger } from '@/lib/logger';

// Get all logs
const logs = FactCheckLogger.getAllLogs();

// Get specific log by ID
const log = FactCheckLogger.getLogById('fc_1704643200000_abc123');

// Get logs by date range
const logs = FactCheckLogger.getLogsByDateRange(
  new Date('2026-01-01'),
  new Date('2026-01-31')
);

// Get logs by verdict
const misleading = FactCheckLogger.getLogsByVerdict('Misleading');

// Get recent logs (default: last 10)
const recent = FactCheckLogger.getRecentLogs(20);

// Get statistics
const stats = FactCheckLogger.getStats();
// Returns: { total, successful, failed, averageDuration, totalCost, verdictBreakdown, etc. }

// Export to regular JSON array
FactCheckLogger.exportToJson('./export.json');

// Clear all logs
FactCheckLogger.clearLogs();
```

### Command Line Tools

```bash
# Count total fact-checks
wc -l logs/fact-checks.jsonl

# View last 5 fact-checks (formatted)
tail -5 logs/fact-checks.jsonl | jq .

# Search for specific URL
grep "https://x.com/user/status/123" logs/fact-checks.jsonl

# Extract all verdicts
cat logs/fact-checks.jsonl | jq -r '.analysis.verdict'

# Find all false claims
cat logs/fact-checks.jsonl | jq 'select(.analysis.verdict == "False")'

# Calculate total cost
cat logs/fact-checks.jsonl | jq -s 'map(.metadata.cost.total) | add'

# Get average accuracy score
cat logs/fact-checks.jsonl | jq -s 'map(.analysis.factualAccuracy) | add / length'
```

## Statistics Available

The `getStats()` method returns:

- **total**: Total fact-checks performed
- **successful**: Number of successful fact-checks
- **failed**: Number of failed fact-checks
- **averageDuration**: Average time per fact-check (ms)
- **totalCost**: Total cost across all fact-checks ($)
- **averageCost**: Average cost per fact-check ($)
- **verdictBreakdown**: Count of each verdict type
- **totalTokensUsed**: Total input/output tokens used

## Console Output

Each fact-check also prints a condensed summary to the console:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 FACT-CHECK ✅ SUCCESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🆔 ID: fc_1704643200000_abc123
🔗 URL: https://x.com/...
📝 Content: The vaccine is 95% effective...

🎯 VERDICT: Mostly Accurate
   Accuracy: 8/10 | Context: 7/10 | Sources: 9/10
   Confidence: 85%

💰 COST: $0.0234 (456→123 tokens)
⏱️  TIME: 8543ms total (scrape: 3200ms, analysis: 4100ms)
📚 SOURCES: 5 found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Use Cases

### Cost Tracking
Monitor API usage and costs over time to validate unit economics.

### Quality Analysis
Identify patterns in accuracy scores and common issues.

### Performance Optimization
Find bottlenecks by analyzing scraping vs analysis durations.

### Content Analysis
Study which types of posts get which verdicts.

### Caching Validation
Compare URLs to identify duplicate fact-checks that should be cached.

## Notes

- Logs are **not** stored in the database (yet)
- The `logs/` directory is excluded from Git
- JSONL format allows streaming and incremental processing
- Each log entry is fully self-contained
