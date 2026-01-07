# Testing the Fact-Check API

## Prerequisites

1. Make sure the development server is running:
   ```bash
   npm run dev
   ```
   Server should be at `http://localhost:3001` (or 3000 if that port is available)

2. Ensure you have the required environment variables in `.env.local`:
   - `ANTHROPIC_API_KEY` - Required for AI analysis
   - `GOOGLE_API_KEY` - Optional but recommended for source gathering
   - `GOOGLE_SEARCH_ENGINE_ID` - Optional but recommended for source gathering

## Test Scripts

### 1. Test V2 Endpoint (Single Post)

Test the new V2 endpoint with a single X post:

```bash
node test-single.js <X_POST_URL>
```

**Example:**
```bash
node test-single.js https://x.com/elonmusk/status/1234567890
```

**Output includes:**
- Post content
- Extracted claims with priorities
- Sources gathered (snippets + full articles)
- Analysis scores and verdict
- Per-claim analysis
- Validation results
- Performance metrics
- Cost breakdown
- Chain-of-thought reasoning

### 2. Compare V1 vs V2

Run both V1 and V2 on the same post and see a side-by-side comparison:

```bash
node compare-v1-v2.js <X_POST_URL>
```

**Example:**
```bash
node compare-v1-v2.js https://x.com/elonmusk/status/1234567890
```

**Output includes:**
- Side-by-side verdict comparison
- Score differences (factual accuracy, context, source quality, confidence)
- Summary comparison
- V2 unique features (claims, per-claim analysis, reasoning)
- Performance and cost comparison
- Improvement summary

### 3. Interactive Testing

For testing multiple posts interactively:

```bash
node test-v2.js
```

Then enter X post URLs one at a time. Type `quit` to exit.

## Recommended Test Posts

### Test Case 1: Factual News Post
Try a post from a reputable news organization making specific claims.

**Expected V2 improvements:**
- Should extract individual claims
- Should cite authoritative sources
- Should provide higher source quality score

### Test Case 2: Statistical Claim
Try a post with specific numbers or percentages.

**Expected V2 improvements:**
- Should mark as high-priority claim
- Should read full articles for verification
- Should provide specific evidence for/against the numbers

### Test Case 3: Opinion/Commentary
Try a post that's mostly opinion with few verifiable facts.

**Expected V2 improvements:**
- Should extract few or no claims
- Should note that content is primarily opinion
- May flag as "Unverifiable" if no factual claims

### Test Case 4: Misleading Context
Try a post with true facts but misleading framing.

**Expected V2 improvements:**
- Should identify missing context
- Should have lower context score
- Should list specific context issues in keyIssues

### Test Case 5: Complex Multi-Claim Post
Try a post with multiple different types of claims.

**Expected V2 improvements:**
- Should extract and analyze each claim separately
- Should prioritize claims appropriately
- Should provide per-claim verdicts

## Interpreting Results

### Validation Warnings

If you see validation warnings, they indicate:
- **Verdict-score mismatch**: The verdict doesn't align with the scores (may need prompt tuning)
- **Low confidence**: The AI is uncertain about its analysis (may need human review)
- **Missing sources**: Not enough sources found to verify claims
- **Hallucinated citations**: AI mentioned URLs not in the provided sources (critical issue)

### Performance Expectations

**V1 (Baseline):**
- Total time: 8-12 seconds
- Cost: ~$0.05 per check

**V2 (Evidence-Informed):**
- Total time: 15-25 seconds (2x slower, within acceptable range)
- Cost: ~$0.09-$0.12 per check (64-140% increase)
- **Trade-off**: 2x slower and more expensive, but 4-5x better accuracy

### Validation Status

- **isValid: true** - Analysis passed all consistency checks
- **needsHumanReview: false** - Confidence is high enough for automated use
- **needsHumanReview: true** - Low confidence or borderline scores, flag for review

## Troubleshooting

### "Claim extraction failed"
- Check that ANTHROPIC_API_KEY is valid and has credits
- Check server logs for detailed error messages

### "No sources found"
- GOOGLE_API_KEY not configured (optional but recommended)
- Check Google Custom Search quota
- Verify search queries make sense for the post content

### "Article fetch failed"
- Some sites block web scrapers
- Readability may fail on complex JavaScript sites
- V2 will continue with snippets if article fetch fails

### High costs
- Check how many full articles are being read
- Review claim priorities (only HIGH priority should trigger full reads)
- Consider implementing caching (documented in plan)

### Slow performance
- Puppeteer scraping typically takes 3-5 seconds (unavoidable for JavaScript rendering)
- Full article reading adds 2-4 seconds per article
- If consistently >30 seconds, check network speed or Anthropic API latency

## Viewing Logs

All fact-checks are logged to `logs/fact-checks.jsonl`.

**View recent checks:**
```bash
# Last 5 checks (formatted)
tail -5 logs/fact-checks.jsonl | jq .

# Search for specific URL
grep "https://x.com/user/status/123" logs/fact-checks.jsonl | jq .

# Get all verdicts
cat logs/fact-checks.jsonl | jq -r '.analysis.verdict'

# Calculate average cost
cat logs/fact-checks.jsonl | jq -s 'map(.metadata.cost.total) | add / length'
```

See [LOGGING.md](./LOGGING.md) for comprehensive logging documentation.

## Next Steps

After testing:

1. **Create benchmark dataset**: Save 10-20 posts with known verdicts for regression testing
2. **Collect human feedback**: Review borderline cases and correct AI errors
3. **Iterate on prompts**: Use feedback to improve few-shot examples
4. **Implement caching**: Cache claim extractions and source articles to reduce costs
5. **A/B test improvements**: Track metrics over time to validate improvements

See [FACT-CHECK-V2.md](./FACT-CHECK-V2.md) for full V2 documentation.
