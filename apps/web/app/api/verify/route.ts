// POST /api/verify - Agentic fact-checking endpoint with SSE streaming

import { NextRequest } from 'next/server';
import puppeteer from 'puppeteer';
import { runFactCheckAgent, type AgentEvent, type AgentConfig } from '@/lib/agent';

// Scrape X post content
async function scrapeXPost(url: string): Promise<{ text: string; timestamp?: string }> {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 });

    const tweetData = await page.evaluate(() => {
      const tweetElement = document.querySelector('div[data-testid="tweetText"]');
      let text = tweetElement?.textContent || '';

      if (!text) {
        const article = document.querySelector('article[data-testid="tweet"]');
        const textDivs = article?.querySelectorAll('div[lang]');
        if (textDivs && textDivs.length > 0) {
          text = textDivs[0].textContent || '';
        }
      }

      let timestamp: string | undefined;
      const timeElement = document.querySelector('article[data-testid="tweet"] time');
      if (timeElement) {
        timestamp = timeElement.getAttribute('datetime') || undefined;
      }

      return { text, timestamp };
    });

    if (!tweetData.text?.trim()) {
      throw new Error('Could not extract tweet content');
    }

    return { text: tweetData.text.trim(), timestamp: tweetData.timestamp };
  } finally {
    if (browser) await browser.close();
  }
}

// SSE encoder
function createSSEEncoder() {
  return new TextEncoder();
}

function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { postUrl, postContent: providedContent } = body;

    if (!postUrl && !providedContent) {
      return new Response(JSON.stringify({ error: 'postUrl or postContent is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate URL if provided
    if (postUrl && !postUrl.includes('twitter.com') && !postUrl.includes('x.com')) {
      return new Response(JSON.stringify({ error: 'URL must be from X (Twitter)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create SSE stream
    const encoder = createSSEEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(formatSSE(event, data)));
        };

        try {
          // Get post content
          let postContent = providedContent;
          let postTimestamp: string | undefined;

          if (!postContent && postUrl) {
            sendEvent('status', { message: 'Scraping post content...' });
            const scraped = await scrapeXPost(postUrl);
            postContent = scraped.text;
            postTimestamp = scraped.timestamp;
            sendEvent('post_content', { content: postContent, timestamp: scraped.timestamp });
          }

          // Run agent with event streaming
          // Use defaults from loop.ts (8 iterations, 5 searches, $0.25 budget)
          const config: Partial<AgentConfig> = {};

          const onEvent = (event: AgentEvent) => {
            sendEvent(event.type, event.data);
          };

          sendEvent('status', { message: 'Starting fact-check agent...' });

          const result = await runFactCheckAgent(
            postContent,
            postUrl || 'direct-input',
            config,
            onEvent,
            postTimestamp
          );

          // Send final result
          sendEvent('result', {
            verdict: result.verdict,
            clarificationNeeded: result.clarificationNeeded,
            stats: result.stats,
            costs: result.costs,
            abortReason: result.abortReason,
          });

          sendEvent('done', { success: true });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sendEvent('error', { error: errorMessage });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Non-streaming version for simple requests
export async function GET(request: NextRequest) {
  return new Response(JSON.stringify({
    endpoint: '/api/verify',
    method: 'POST',
    description: 'Agentic fact-checking endpoint',
    body: {
      postUrl: 'URL of X/Twitter post (optional if postContent provided)',
      postContent: 'Direct post content (optional if postUrl provided)',
    },
    response: 'Server-Sent Events stream',
    events: [
      'status - Progress updates',
      'post_content - Scraped post content',
      'thinking - Agent iteration',
      'tool_call - Tool being called',
      'tool_result - Tool result',
      'verdict - Final verdict submitted',
      'clarification - Clarification needed',
      'result - Final result with stats and costs',
      'error - Error occurred',
      'done - Stream complete',
    ],
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
