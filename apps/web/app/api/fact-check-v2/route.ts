// V2: Evidence-informed fact-checking with multi-stage pipeline
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { FactCheckLogger } from '@/lib/logger';
import { CLAIM_EXTRACTION_PROMPT, EVIDENCE_ANALYSIS_PROMPT } from '@/lib/prompts';
import { fetchFullArticle, extractRelevantPassages, formatSourcesForPrompt, scoreSourceAuthority } from '@/lib/source-fetcher';
import { validateAnalysis } from '@/lib/validator';
import type {
  ClaimExtractionResult,
  Claim,
  SourceSnippet,
  DeepSource,
  FactCheckAnalysis,
  FactCheckResult,
} from '@/lib/types';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Scrape X post content using Puppeteer (unchanged from v1)
async function scrapeXPost(url: string): Promise<string> {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating to URL...');
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    console.log('Waiting for tweet content...');
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });

    const tweetText = await page.evaluate(() => {
      const tweetElement = document.querySelector('div[data-testid="tweetText"]');
      if (tweetElement) {
        return tweetElement.textContent || '';
      }

      const article = document.querySelector('article[data-testid="tweet"]');
      if (article) {
        const textDivs = article.querySelectorAll('div[lang]');
        if (textDivs.length > 0) {
          return textDivs[0].textContent || '';
        }
      }

      return '';
    });

    if (!tweetText || tweetText.trim().length === 0) {
      throw new Error('Could not extract tweet content. The post may be deleted, private, or unavailable.');
    }

    console.log('Successfully extracted tweet:', tweetText.substring(0, 100));
    return tweetText.trim();

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
        throw new Error('Invalid URL or network error');
      }
      if (error.message.includes('Timeout')) {
        throw new Error('Page took too long to load. The post may be unavailable.');
      }
      throw new Error(`Failed to scrape post: ${error.message}`);
    }
    throw new Error('Failed to scrape post: Unknown error');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// STAGE 1: Extract claims from post content
async function extractClaims(postContent: string): Promise<ClaimExtractionResult> {
  console.log('Stage 1: Extracting claims...');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.3, // Low temperature for consistency
      messages: [{
        role: 'user',
        content: CLAIM_EXTRACTION_PROMPT(postContent),
      }],
    });

    let responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Remove markdown code blocks if present
    responseText = responseText.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const result: ClaimExtractionResult = JSON.parse(responseText.trim());
    console.log(`Extracted ${result.claims.length} claims`);

    return result;
  } catch (error) {
    console.error('Claim extraction failed:', error);
    throw new Error(`Claim extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// STAGE 2: Gather sources (snippets + full articles for high-priority claims)
async function gatherSources(claims: Claim[], postContent: string): Promise<{
  snippets: SourceSnippet[],
  deep: DeepSource[],
}> {
  console.log('Stage 2: Gathering sources...');

  const apiKey = process.env.GOOGLE_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    console.warn('Google Search API not configured, returning empty sources');
    return { snippets: [], deep: [] };
  }

  const snippets: SourceSnippet[] = [];
  const deepSources: DeepSource[] = [];

  // If no claims, do a general search
  const searchQueries = claims.length > 0
    ? claims.slice(0, 3).map(c => c.searchQuery) // Top 3 claims
    : [postContent.substring(0, 100)];

  try {
    // Perform Google searches
    for (const query of searchQueries) {
      const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: apiKey,
          cx: searchEngineId,
          q: query,
          num: 5,
        },
        timeout: 5000,
      });

      const items = response.data.items || [];
      items.slice(0, 3).forEach((item: any) => {
        snippets.push({
          title: item.title,
          url: item.link,
          snippet: item.snippet,
        });
      });
    }

    // Remove duplicates
    const uniqueSnippets = snippets.filter((s, index, self) =>
      index === self.findIndex(t => t.url === s.url)
    );

    // Fetch full articles for high-priority claims
    const highPriorityClaims = claims.filter(c => c.requiresFullSourceRead && c.priority === 'high');

    if (highPriorityClaims.length > 0) {
      console.log(`Fetching full articles for ${highPriorityClaims.length} high-priority claims...`);

      // Get top authoritative sources from snippets
      const topSources = uniqueSnippets
        .sort((a, b) => scoreSourceAuthority(b.url) - scoreSourceAuthority(a.url))
        .slice(0, 2); // Top 2 most authoritative

      for (const source of topSources) {
        const article = await fetchFullArticle(source.url);
        if (article) {
          // Extract relevant passages for each high-priority claim
          for (const claim of highPriorityClaims) {
            const passages = extractRelevantPassages(article, claim.text);
            article.relevantPassages.push(...passages);
          }

          deepSources.push(article);
        }
      }
    }

    return {
      snippets: uniqueSnippets.slice(0, 5),
      deep: deepSources,
    };

  } catch (error) {
    console.error('Source gathering failed:', error);
    return { snippets: [], deep: [] };
  }
}

// STAGE 3: Analyze with evidence
async function analyzeWithEvidence(
  postContent: string,
  claims: Claim[],
  sources: { snippets: SourceSnippet[], deep: DeepSource[] }
): Promise<{
  analysis: FactCheckAnalysis,
  tokenUsage: { input: number, output: number },
}> {
  console.log('Stage 3: Analyzing with evidence...');

  const formattedSources = formatSourcesForPrompt(sources.snippets, sources.deep);
  const claimsForPrompt = claims.map(c => ({ text: c.text, type: c.type }));

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048, // Increased for detailed reasoning
      temperature: 0.2, // Low temperature for deterministic scoring
      messages: [{
        role: 'user',
        content: EVIDENCE_ANALYSIS_PROMPT(postContent, claimsForPrompt, formattedSources),
      }],
    });

    let responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Remove markdown code blocks
    responseText = responseText.trim();
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const analysis: FactCheckAnalysis = JSON.parse(responseText.trim());

    const tokenUsage = {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
    };

    return { analysis, tokenUsage };

  } catch (error) {
    console.error('Evidence analysis failed:', error);
    throw new Error(`Evidence analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Main API handler
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let postUrl = '';
  let postContent = '';

  try {
    const body = await request.json();
    postUrl = body.postUrl;

    if (!postUrl) {
      return NextResponse.json(
        { error: 'Post URL is required' },
        { status: 400 }
      );
    }

    // Validate URL is from X/Twitter
    if (!postUrl.includes('twitter.com') && !postUrl.includes('x.com')) {
      return NextResponse.json(
        { error: 'URL must be from X (Twitter)' },
        { status: 400 }
      );
    }

    // SCRAPING
    console.log('Scraping post:', postUrl);
    const scrapeStart = Date.now();
    postContent = await scrapeXPost(postUrl);
    const scrapeDuration = Date.now() - scrapeStart;

    // STAGE 1: CLAIM EXTRACTION
    const claimStart = Date.now();
    const claimExtraction = await extractClaims(postContent);
    const claimDuration = Date.now() - claimStart;

    // STAGE 2: SOURCE GATHERING
    const sourceStart = Date.now();
    const sources = await gatherSources(claimExtraction.claims, postContent);
    const sourceDuration = Date.now() - sourceStart;

    // STAGE 3: EVIDENCE-INFORMED ANALYSIS
    const analysisStart = Date.now();
    const { analysis, tokenUsage } = await analyzeWithEvidence(
      postContent,
      claimExtraction.claims,
      sources
    );
    const analysisDuration = Date.now() - analysisStart;

    // STAGE 4: VALIDATION
    const validationStart = Date.now();
    const validation = validateAnalysis(analysis, sources);
    const validationDuration = Date.now() - validationStart;

    const totalDuration = Date.now() - startTime;

    // Calculate costs
    const ANTHROPIC_INPUT_COST = 0.003 / 1000;
    const ANTHROPIC_OUTPUT_COST = 0.015 / 1000;
    const GOOGLE_SEARCH_COST = 0.005;

    const analysisCost = (tokenUsage.input * ANTHROPIC_INPUT_COST) + (tokenUsage.output * ANTHROPIC_OUTPUT_COST);
    const searchCost = sources.snippets.length > 0 ? GOOGLE_SEARCH_COST : 0;
    const articleFetchCost = sources.deep.length * 0.01; // Estimated bandwidth cost
    const totalCost = analysisCost + searchCost + articleFetchCost;

    const result: FactCheckResult = {
      postUrl,
      postContent,
      claims: claimExtraction.claims,
      analysis,
      sources,
      validation,
      timestamp: new Date().toISOString(),
      version: 'v2-evidence-informed',
    };

    // LOG THE FACT-CHECK
    FactCheckLogger.log({
      timestamp: result.timestamp,
      postUrl,
      postContent,
      contentLength: postContent.length,
      analysis: {
        ...analysis,
        keyIssues: analysis.keyIssues || [],
      },
      sources: [
        ...sources.snippets.map(s => ({ title: s.title, url: s.url, snippet: s.snippet })),
        ...sources.deep.map(s => ({ title: s.title, url: s.url, snippet: `Full article (${s.authorityScore}/10)` })),
      ],
      metadata: {
        scrapeDurationMs: scrapeDuration,
        analysisDurationMs: claimDuration + analysisStart,
        searchDurationMs: sourceDuration,
        totalDurationMs: totalDuration,
        anthropicTokensUsed: tokenUsage,
        cost: {
          scraping: 0,
          analysis: analysisCost,
          search: searchCost + articleFetchCost,
          total: totalCost,
        },
      },
      success: true,
    });

    // Return result with validation info
    return NextResponse.json({
      ...result,
      metadata: {
        version: 'v2-evidence-informed',
        claimsExtracted: claimExtraction.claims.length,
        sourcesGathered: {
          snippets: sources.snippets.length,
          fullArticles: sources.deep.length,
        },
        performance: {
          scrapeDurationMs: scrapeDuration,
          claimExtractionMs: claimDuration,
          sourceGatheringMs: sourceDuration,
          analysisMs: analysisDuration,
          validationMs: validationDuration,
          totalDurationMs: totalDuration,
        },
        costs: {
          analysis: analysisCost,
          search: searchCost,
          articleFetch: articleFetchCost,
          total: totalCost,
        },
        validation: validation.isValid ? 'passed' : 'failed',
        needsHumanReview: validation.needsHumanReview,
        validationIssues: validation.issues,
        validationWarnings: validation.warnings,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during fact-checking';
    console.error('Fact-check error:', error);

    // LOG THE ERROR
    FactCheckLogger.log({
      timestamp: new Date().toISOString(),
      postUrl,
      postContent,
      contentLength: postContent.length,
      analysis: {
        factualAccuracy: 0,
        contextScore: 0,
        sourceQuality: 0,
        confidence: 0,
        verdict: 'Error',
        summary: '',
        keyIssues: [],
      },
      sources: [],
      metadata: {
        scrapeDurationMs: 0,
        analysisDurationMs: 0,
        searchDurationMs: 0,
        totalDurationMs: Date.now() - startTime,
      },
      success: false,
      errorMessage,
    });

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
