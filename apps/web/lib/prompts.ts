// Centralized prompt management for fact-checking system

export const SYSTEM_PROMPT = `You are a professional fact-checker with expertise in:
- Detecting misinformation and disinformation
- Evaluating source credibility
- Identifying missing context and misleading framing
- Statistical and numerical claim verification
- Attribution and quote verification

Your goal is maximum accuracy. When uncertain, state limitations clearly.
You MUST cite sources for all factual claims in your analysis.
ONLY cite sources from the EVIDENCE SOURCES section provided - never make up or hallucinate sources.`;

export const FEW_SHOT_EXAMPLES = `Here are examples of high-quality fact-checks:

EXAMPLE 1: False Statistical Claim
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POST: "95% of climate scientists agree climate change is a hoax"
SOURCES:
- NASA: 97% of climate scientists agree humans cause climate change
- IPCC Report 2021: Scientific consensus is overwhelming
- Skeptical Science: Examined 12,000 papers, 97% consensus

ANALYSIS:
claimAnalysis: [
  {
    claim: "95% of climate scientists agree climate change is a hoax",
    verdict: "false",
    evidence: "NASA and multiple peer-reviewed studies show 97% consensus that climate change is real and human-caused, directly contradicting this claim."
  }
]
factualAccuracy: 1/10 (claim is inverted from reality)
contextScore: 0/10 (completely misleading)
sourceQuality: 10/10 (authoritative sources clearly contradict)
confidence: 95%
verdict: "False"
summary: "This claim inverts scientific consensus. Authoritative sources (NASA, IPCC) confirm 97% of climate scientists agree climate change is real and human-caused, not a hoax."
keyIssues: [
  "Inverts actual scientific consensus (97% agree it's real, not a hoax)",
  "No credible sources support this claim",
  "Contradicted by NASA, IPCC, and peer-reviewed research"
]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EXAMPLE 2: Misleading Context
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POST: "Crime has increased 300% in major cities since 2020"
SOURCES:
- FBI Crime Statistics: Some categories up, others down
- Context: COVID-19 pandemic disrupted reporting
- Overall violent crime up ~30% 2020-2021 in specific cities

ANALYSIS:
claimAnalysis: [
  {
    claim: "Crime has increased 300% in major cities since 2020",
    verdict: "misleading",
    evidence: "FBI data shows increases, but not 300% overall. Specific categories (carjacking in some cities) saw large spikes, but overall violent crime increased ~30%."
  }
]
factualAccuracy: 4/10 (number is exaggerated)
contextScore: 3/10 (cherry-picks worst category, ignores context)
sourceQuality: 8/10 (FBI data exists but claim misrepresents it)
confidence: 85%
verdict: "Misleading"
summary: "While crime did increase in some cities post-2020, the 300% figure cherry-picks specific categories. FBI data shows overall violent crime increased ~30%, not 300%."
keyIssues: [
  "Exaggerates overall crime increase (actual: ~30%, claimed: 300%)",
  "Cherry-picks worst-performing categories without disclosure",
  "Omits COVID-19 pandemic context and reporting disruptions"
]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Now analyze the following post using the same rigorous standards:`;

export const CLAIM_EXTRACTION_PROMPT = (postContent: string) => `Analyze this X post and extract all verifiable factual claims.

POST CONTENT:
"${postContent}"

IMPORTANT: Extract SEPARATE, NON-OVERLAPPING claims. Temporal modifiers ("X days ago", "recently") should be separate from substantive claims.

CONSOLIDATION RULES:
- Lists of names, individuals, or entities should be extracted as ONE consolidated claim, not separate claims per name
- Example: "Nine Republicans (Fitzpatrick, Bresnahan, Kean, LaLota, Lawler, Mackenzie, Miller, Elvira-Salazar, Valadao) voted with Democrats" - NOT separate claims for each name
- Multiple related supporting details (dates, locations, minor facts) should be grouped together when they serve the same verification purpose
- Only extract separate claims when each requires DIFFERENT verification sources or methods
- Err on the side of consolidation for LOW priority supporting details

For each claim, determine:
1. The exact claim text (standalone statement)
2. Claim type (statistical, attribution, event, date, other)
3. Priority (high=needs deep verification, medium=standard, low=minor)
4. Optimized Google search query
5. Whether full article reading is needed (vs snippets)

CLAIM PRIORITIZATION GUIDELINES:
- HIGH priority (use sparingly - typically 1-2 claims max):
  * The PRIMARY claim or central assertion of the post
  * Statistics or percentages that are the core of the argument
  * Claims that directly contradict widely-established facts
  * Scientific or technical claims that are actively disputed
- MEDIUM priority (use sparingly - only when genuinely important):
  * Secondary factual claims that significantly support the main argument
  * Policy claims with substantial implications
  * Historical references that are contentious or disputed
- LOW priority (default for most claims):
  * Supporting details, names, or attributions
  * Verifiable dates and temporal references
  * General factual statements
  * Non-controversial statistics
  * Obvious facts or widely-known information
  * Attribution sources (e.g., "Punchbowl reported")
  * Lists of names or specific individuals mentioned

FULL ARTICLE READING NEEDED WHEN (rare - most claims should be FALSE):
- Direct quote attribution where surrounding context is critical to meaning
- Statistical methodology claims where snippets won't show the full calculation
- ONLY when you genuinely expect search snippets to be incomplete or misleading
- DEFAULT to FALSE: Most claims can be verified with search snippets alone
- Controversial or disputed claims usually DON'T need full articles - snippets from multiple sources are sufficient

Output JSON format:
{
  "claims": [
    {
      "text": "exact claim text from post",
      "type": "statistical|attribution|event|date|other",
      "priority": "high|medium|low",
      "searchQuery": "optimized search query for Google",
      "requiresFullSourceRead": true|false
    }
  ],
  "overallTone": "factual|opinion|mixed|humorous",
  "postType": "news|personal|commentary|meme|satire"
}

If the post contains NO verifiable factual claims (pure opinion, humor, etc.), return an empty claims array.

Respond ONLY with valid JSON, no additional text.`;

export const EVIDENCE_ANALYSIS_PROMPT = (
  postContent: string,
  claims: Array<{ text: string, type: string }>,
  sources: string,
  postTimestamp?: string,
  isBreakingNews: boolean = false
) => `${SYSTEM_PROMPT}

${FEW_SHOT_EXAMPLES}

POST CONTENT:
"${postContent}"
${postTimestamp ? `\nPOST TIMESTAMP: ${postTimestamp} (${new Date(postTimestamp).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })})` : ''}
${isBreakingNews ? '\nNOTE: This appears to be breaking/recent news. Sources may be limited as events just occurred. Adjust confidence accordingly if verification sources are sparse.' : ''}

IDENTIFIED CLAIMS:
${claims.map((c, i) => `${i + 1}. ${c.text} (${c.type})`).join('\n')}

EVIDENCE SOURCES:
${sources}

ANALYSIS INSTRUCTIONS:

1. CLAIM-BY-CLAIM VERIFICATION:
   - For each claim, cite which sources support/contradict it
   - Note if sources are missing/insufficient
   - Flag any claims that can't be verified
   - Be specific: "Claim X is contradicted by source Y which states Z"
   ${postTimestamp ? '- For time-sensitive claims (e.g., "X days ago", "recently"), use the post timestamp to verify accuracy' : ''}

2. SCORING RUBRIC (Be specific and cite evidence):

   Factual Accuracy (0-10):
   - 9-10: All major claims verified by authoritative sources
   - 7-8: Most claims accurate, minor errors or unsupported details
   - 5-6: Mix of accurate and false claims
   - 3-4: Major claims are false or misleading
   - 0-2: Predominantly false information

   Context Score (0-10):
   - 9-10: All relevant context provided, no misleading framing
   - 7-8: Minor context missing but not misleading
   - 5-6: Important context missing that changes interpretation
   - 3-4: Critical context omitted, creates false impression
   - 0-2: Cherry-picked facts, severely misleading framing

   Source Quality (0-10):
   - 9-10: Multiple authoritative sources verify all claims
   - 7-8: Reputable sources for most claims
   - 5-6: Some credible sources, but gaps exist
   - 3-4: Weak or biased sources only
   - 0-2: No credible sources or claims contradict evidence

   Confidence (0-100%):
   - Based on source availability and consistency
   - Lower if sources contradict or are insufficient
   - If sources are ambiguous or conflicting, confidence should be <70%

3. CHAIN-OF-THOUGHT REASONING:
   - Explain your reasoning for each score
   - Cite specific sources by URL or title
   - Note any uncertainties or limitations in the evidence

4. KEY ISSUES:
   - List 2-5 specific problems (if any)
   - Be concrete: "Claim 'X' is false because source Y shows Z"
   - Avoid vague statements like "lacks context" - specify what context is missing

5. LOGICAL FALLACIES:
   - Identify any logical fallacies present in the post's argumentation
   - Common types: ad hominem, straw man, false dichotomy, slippery slope, appeal to emotion, hasty generalization, cherry picking
   - For each fallacy: provide type, description, and quote the specific example from the post
   - Omit this field entirely if no fallacies are detected

Output JSON format:
{
  "claimAnalysis": [
    {
      "claim": "claim text",
      "verdict": "accurate|misleading|false|unverifiable",
      "evidence": "specific source citations and reasoning"
    }
  ],
  "factualAccuracy": 0-10,
  "contextScore": 0-10,
  "sourceQuality": 0-10,
  "confidence": 0-100,
  "verdict": "Accurate|Mostly Accurate|Misleading|Mostly False|False|Unverifiable",
  "summary": "2-3 sentence assessment with source citations",
  "keyIssues": ["specific issue 1 with evidence", "specific issue 2 with evidence"],
  "reasoning": "Your chain-of-thought explanation for the scores you assigned",
  "logicalFallacies": [
    {
      "type": "fallacy type (e.g., ad hominem, straw man)",
      "description": "brief explanation of why this is a fallacy",
      "example": "exact quote from post demonstrating the fallacy"
    }
  ]
}

Remember: ONLY cite sources that were provided in the EVIDENCE SOURCES section above. Never make up or hallucinate sources.

Respond ONLY with valid JSON, no additional text.`;

export const SCORING_RUBRIC = `
FACTUAL ACCURACY SCALE:
10 = Completely true, all claims verified
9  = True with trivial errors
8  = Mostly true, minor inaccuracies
7  = Generally accurate with some errors
6  = Mix of true and false, leaning accurate
5  = Equal mix of accurate and inaccurate
4  = More false than true
3  = Mostly false with some accurate elements
2  = Predominantly false
1  = Almost entirely false
0  = Completely fabricated

CONTEXT SCORE SCALE:
10 = Perfect contextualization
9  = Trivial context missing
8  = Minor context missing
7  = Some important context omitted
6  = Significant context missing
5  = Critical context missing
4  = Misleading framing, cherry-picked
3  = Severely misleading presentation
2  = Context deliberately omitted
1  = Designed to deceive
0  = Malicious decontextualization

SOURCE QUALITY SCALE:
10 = Multiple tier-1 authoritative sources
9  = Strong authoritative sources
8  = Reputable mainstream sources
7  = Generally credible sources
6  = Mix of credible and weak sources
5  = Weak but not completely unreliable
4  = Questionable sources
3  = Biased or low-credibility sources
2  = Unreliable sources only
1  = Disreputable sources
0  = No sources or fabricated sources
`;
