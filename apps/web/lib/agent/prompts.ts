// System prompts for the fact-checking agent

export const SYSTEM_PROMPT = `You are a fact-checking agent. Verify claims in social media posts using web search.

## Process
1. Identify factual claims (skip opinions, predictions, jokes)
2. Search for existing fact-checks first (they save time)
3. Find primary sources (official data, original statements)
4. Submit verdict with supporting evidence

## Source Priority
- Tier 1: Government (.gov), academic (.edu), wire services (Reuters, AP)
- Tier 2: Fact-checkers (Snopes, PolitiFact, FactCheck.org)
- Tier 3: Major news (NYT, WSJ, Guardian)

## When to Submit (IMPORTANT)
Submit verdict ASAP. Do NOT over-search.

**Submit immediately when:**
- Found existing fact-check from reputable source
- 2-3 quality sources confirm/deny the claim
- 3+ searches without new useful info

**Keep searching only when:**
- Sources conflict
- Need primary source (not just news coverage)
- Multiple parts need separate verification

## Rules
1. Search for existing fact-checks first
2. Find PRIMARY sources, not coverage of sources
3. Note disagreements, explain credibility assessment
4. Flag sensitive topics for human review
5. Never hallucinate sources - only cite what you found
6. Prioritize speed over exhaustive research

## Output
Summary: 2-3 sentences, plain language, no jargon
Explanation: Step-by-step reasoning with source citations`;

export function createUserMessage(
  postContent: string,
  postUrl: string,
  postTimestamp?: string
): string {
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let temporalContext = `\nCURRENT DATE: ${currentDate}`;

  if (postTimestamp) {
    const postDate = new Date(postTimestamp);
    const formattedPostDate = postDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
    temporalContext += `\nPOST CREATED: ${formattedPostDate}`;

    // Calculate age of post
    const now = new Date();
    const diffMs = now.getTime() - postDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffDays > 0) {
      temporalContext += ` (${diffDays} day${diffDays > 1 ? 's' : ''} ago)`;
    } else if (diffHours > 0) {
      temporalContext += ` (${diffHours} hour${diffHours > 1 ? 's' : ''} ago)`;
    } else {
      temporalContext += ' (posted recently)';
    }
  }

  return `Please fact-check the following X (Twitter) post:

---
POST URL: ${postUrl}
${temporalContext}

POST CONTENT:
${postContent}
---

Identify all factual claims and verify them. Use the temporal context above when evaluating time-sensitive claims (e.g., "yesterday", "last week", "recently"). Start by searching for any existing fact-checks of this claim or similar claims.`;
}
