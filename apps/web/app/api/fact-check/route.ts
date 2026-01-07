import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { FactCheckLogger } from '@/lib/logger';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Interface for fact-check results
interface FactCheckResult {
  postUrl: string;
  postContent: string;
  analysis: {
    factualAccuracy: number;
    contextScore: number;
    sourceQuality: number;
    confidence: number;
    verdict: string;
    summary: string;
    keyIssues: string[];
  };
  sources: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  timestamp: string;
}

// Scrape X post content using Puppeteer
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

    // Set viewport and user agent
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('Navigating to URL...');
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for tweet content to load
    console.log('Waiting for tweet content...');
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });

    // Extract tweet text
    const tweetText = await page.evaluate(() => {
      // Try multiple selectors for tweet text
      const tweetElement = document.querySelector('div[data-testid="tweetText"]');
      if (tweetElement) {
        return tweetElement.textContent || '';
      }

      // Fallback: try to find any text within the article
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

// Perform AI analysis using Claude
async function analyzeWithClaude(content: string): Promise<{
  analysis: FactCheckResult['analysis'],
  tokenUsage: { input: number, output: number },
}> {
  const prompt = `You are a professional fact-checker analyzing social media content. Analyze the following post and provide a comprehensive fact-check.

Post content:
"${content}"

Provide your analysis in the following JSON format:
{
  "factualAccuracy": <number 0-10>,
  "contextScore": <number 0-10>,
  "sourceQuality": <number 0-10>,
  "confidence": <percentage 0-100>,
  "verdict": "<one of: Accurate, Mostly Accurate, Misleading, Mostly False, False, Unverifiable>",
  "summary": "<2-3 sentence summary of your assessment>",
  "keyIssues": ["<issue 1>", "<issue 2>", "<issue 3>"]
}

Rating guidelines:
- Factual Accuracy: How true are the claims? (0=completely false, 10=completely true)
- Context Score: Is important context missing? (0=missing critical context, 10=fully contextualized)
- Source Quality: Are claims backed by credible sources? (0=no sources/bad sources, 10=excellent authoritative sources)
- Confidence: How certain are you about this assessment? (0-100%)

Respond ONLY with valid JSON, no additional text.`;

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt,
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

    const analysis = JSON.parse(responseText.trim());

    // Extract token usage from the response
    const tokenUsage = {
      input: message.usage.input_tokens,
      output: message.usage.output_tokens,
    };

    return { analysis, tokenUsage };
  } catch (error) {
    throw new Error(`AI analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Search for sources using Google Custom Search
async function searchSources(content: string): Promise<FactCheckResult['sources']> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !searchEngineId) {
    console.warn('Google Search API not configured, returning empty sources');
    return [];
  }

  try {
    // Extract key claims/topics from the content for search
    const searchQuery = content.substring(0, 100); // Simplified for POC

    const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx: searchEngineId,
        q: searchQuery,
        num: 5,
      },
    });

    const sources = response.data.items?.slice(0, 5).map((item: any) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    })) || [];

    return sources;
  } catch (error) {
    console.error('Source search failed:', error);
    return [];
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

    // ANALYSIS
    console.log('Analyzing content with Claude...');
    const analysisStart = Date.now();
    const { analysis, tokenUsage } = await analyzeWithClaude(postContent);
    const analysisDuration = Date.now() - analysisStart;

    // SOURCE SEARCH
    console.log('Searching for sources...');
    const searchStart = Date.now();
    const sources = await searchSources(postContent);
    const searchDuration = Date.now() - searchStart;

    const totalDuration = Date.now() - startTime;

    // Calculate costs
    const ANTHROPIC_INPUT_COST = 0.003 / 1000; // $3 per million tokens = $0.003 per 1k tokens
    const ANTHROPIC_OUTPUT_COST = 0.015 / 1000; // $15 per million tokens = $0.015 per 1k tokens
    const GOOGLE_SEARCH_COST = 0.005; // $5 per 1000 queries = $0.005 per query

    const analysisCost = (tokenUsage.input * ANTHROPIC_INPUT_COST) + (tokenUsage.output * ANTHROPIC_OUTPUT_COST);
    const searchCost = sources.length > 0 ? GOOGLE_SEARCH_COST : 0;
    const scrapingCost = 0; // Free for now (Puppeteer), but costs bandwidth
    const totalCost = analysisCost + searchCost + scrapingCost;

    const result: FactCheckResult = {
      postUrl,
      postContent,
      analysis,
      sources,
      timestamp: new Date().toISOString(),
    };

    // LOG THE FACT-CHECK
    FactCheckLogger.log({
      timestamp: result.timestamp,
      postUrl,
      postContent,
      contentLength: postContent.length,
      analysis,
      sources,
      metadata: {
        scrapeDurationMs: scrapeDuration,
        analysisDurationMs: analysisDuration,
        searchDurationMs: searchDuration,
        totalDurationMs: totalDuration,
        anthropicTokensUsed: tokenUsage,
        cost: {
          scraping: scrapingCost,
          analysis: analysisCost,
          search: searchCost,
          total: totalCost,
        },
      },
      success: true,
    });

    return NextResponse.json(result);
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
