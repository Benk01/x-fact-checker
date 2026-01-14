// POST /api/verify - Agentic fact-checking endpoint with SSE streaming

import { NextRequest } from 'next/server';
import puppeteer from 'puppeteer';
import { runFactCheckAgent, type AgentEvent, type AgentConfig } from '@/lib/agent';
import { type ExtractedXPost } from '@/lib/types';

// Scrape X post content with enhanced extraction
async function scrapeXPost(url: string): Promise<ExtractedXPost> {
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
      const article = document.querySelector('article[data-testid="tweet"]');
      if (!article) return null;

      // Extract post text
      const tweetElement = article.querySelector('div[data-testid="tweetText"]');
      let text = tweetElement?.textContent || '';

      if (!text) {
        const textDivs = article.querySelectorAll('div[lang]');
        if (textDivs && textDivs.length > 0) {
          text = textDivs[0].textContent || '';
        }
      }

      // Extract timestamp
      let timestamp: string | undefined;
      const timeElement = article.querySelector('time');
      if (timeElement) {
        timestamp = timeElement.getAttribute('datetime') || undefined;
      }

      // Extract author info
      const userNameContainer = article.querySelector('[data-testid="User-Name"]');
      let displayName = '';
      let username = '';

      if (userNameContainer) {
        // Display name is typically in the first span
        const displayNameSpan = userNameContainer.querySelector('span');
        displayName = displayNameSpan?.textContent?.trim() || '';

        // Username is in a link that contains the handle
        const userLinks = userNameContainer.querySelectorAll('a[href^="/"]');
        for (const link of userLinks) {
          const href = link.getAttribute('href');
          if (href && href.startsWith('/') && !href.includes('/status/')) {
            username = href.slice(1); // Remove leading /
            break;
          }
        }
      }

      // Extract images
      const images: string[] = [];
      const imageElements = article.querySelectorAll('[data-testid="tweetPhoto"] img');
      imageElements.forEach((img) => {
        const src = img.getAttribute('src');
        if (src && src.includes('pbs.twimg.com')) {
          images.push(src);
        }
      });

      // Extract quoted post
      let quotedPost: {
        text: string;
        author: { username: string; displayName: string };
        url?: string;
      } | undefined;

      // Look for quoted tweet (nested article or blockquote)
      const quotedArticle = article.querySelector('[data-testid="quoteTweet"]') ||
                           article.querySelector('article article') ||
                           article.querySelector('[role="blockquote"]');

      if (quotedArticle) {
        const quotedTextEl = quotedArticle.querySelector('div[data-testid="tweetText"]') ||
                            quotedArticle.querySelector('div[lang]');
        const quotedText = quotedTextEl?.textContent?.trim() || '';

        const quotedUserContainer = quotedArticle.querySelector('[data-testid="User-Name"]');
        let quotedDisplayName = '';
        let quotedUsername = '';

        if (quotedUserContainer) {
          const quotedDisplayNameSpan = quotedUserContainer.querySelector('span');
          quotedDisplayName = quotedDisplayNameSpan?.textContent?.trim() || '';

          const quotedUserLinks = quotedUserContainer.querySelectorAll('a[href^="/"]');
          for (const link of quotedUserLinks) {
            const href = link.getAttribute('href');
            if (href && href.startsWith('/') && !href.includes('/status/')) {
              quotedUsername = href.slice(1);
              break;
            }
          }
        }

        // Try to get quoted post URL
        let quotedUrl: string | undefined;
        const quotedLink = quotedArticle.querySelector('a[href*="/status/"]');
        if (quotedLink) {
          quotedUrl = 'https://x.com' + quotedLink.getAttribute('href');
        }

        if (quotedText) {
          quotedPost = {
            text: quotedText,
            author: {
              username: quotedUsername,
              displayName: quotedDisplayName,
            },
            url: quotedUrl,
          };
        }
      }

      return {
        text,
        timestamp,
        author: { username, displayName },
        images,
        quotedPost,
      };
    });

    if (!tweetData || !tweetData.text?.trim()) {
      throw new Error('Could not extract tweet content');
    }

    return {
      text: tweetData.text.trim(),
      timestamp: tweetData.timestamp,
      author: {
        username: tweetData.author.username || 'unknown',
        displayName: tweetData.author.displayName || 'Unknown',
      },
      media: {
        images: tweetData.images || [],
      },
      quotedPost: tweetData.quotedPost,
    };
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
          let extractedPost: ExtractedXPost | null = null;
          let postContent = providedContent;

          if (!postContent && postUrl) {
            sendEvent('status', { message: 'Scraping post content...' });
            extractedPost = await scrapeXPost(postUrl);
            postContent = extractedPost.text;
            sendEvent('post_content', {
              content: extractedPost.text,
              timestamp: extractedPost.timestamp,
              author: extractedPost.author,
              media: extractedPost.media,
              quotedPost: extractedPost.quotedPost,
            });
          } else if (providedContent) {
            // Create minimal ExtractedXPost for direct content
            extractedPost = {
              text: providedContent,
              author: { username: 'unknown', displayName: 'Unknown' },
              media: { images: [] },
            };
          }

          // Run agent with event streaming
          // Use defaults from loop.ts (8 iterations, 5 searches, $0.25 budget)
          const config: Partial<AgentConfig> = {};

          const onEvent = (event: AgentEvent) => {
            sendEvent(event.type, event.data);
          };

          sendEvent('status', { message: 'Starting fact-check agent...' });

          const result = await runFactCheckAgent(
            extractedPost!,
            postUrl || 'direct-input',
            config,
            onEvent
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
