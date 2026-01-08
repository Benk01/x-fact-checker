// Source fetching and article extraction

import axios from 'axios';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import type { DeepSource, SourceSnippet } from './types';

// Authority tier mapping (from project brief)
const TIER_1_DOMAINS = [
  // Government agencies
  'cdc.gov', 'fda.gov', 'who.int', 'census.gov', 'nih.gov', 'usgs.gov',
  // Major fact-checkers
  'snopes.com', 'politifact.com', 'factcheck.org', 'fullfact.org',
  // Academic
  'pubmed.ncbi.nlm.nih.gov', 'arxiv.org', '.edu',
  // Major news agencies
  'ap.org', 'reuters.com', 'bbc.com', 'bbc.co.uk',
];

const TIER_2_DOMAINS = [
  'nytimes.com', 'washingtonpost.com', 'wsj.com', 'theguardian.com',
  'npr.org', 'pbs.org', 'cnn.com', 'bloomberg.com',
];

export function scoreSourceAuthority(url: string): number {
  const domain = new URL(url).hostname.toLowerCase();

  // Tier 1: Authority score 9-10
  if (TIER_1_DOMAINS.some(d => domain.includes(d))) {
    return 10;
  }

  // Tier 2: Authority score 7-8
  if (TIER_2_DOMAINS.some(d => domain.includes(d))) {
    return 8;
  }

  // Tier 3: Domain reputation analysis
  // For now, default to medium authority
  // In production, integrate with NewsGuard or similar
  return 5;
}

export async function fetchFullArticle(url: string): Promise<DeepSource | null> {
  try {
    console.log(`Fetching full article: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      timeout: 8000, // 8 second timeout (optimized for speed)
      maxRedirects: 3,
    });

    // Parse HTML and extract article content
    const dom = new JSDOM(response.data, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article || !article.textContent) {
      console.warn(`Could not extract article content from: ${url}`);
      return null;
    }

    const authorityScore = scoreSourceAuthority(url);

    return {
      url,
      title: article.title || 'Untitled',
      fullText: article.textContent,
      relevantPassages: [], // Will be extracted later based on claims
      authorityScore,
    };
  } catch (error) {
    console.error(`Failed to fetch article ${url}:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export function extractRelevantPassages(
  article: DeepSource,
  claim: string
): string[] {
  // Simple keyword-based extraction for now
  // In production, use more sophisticated NLP/semantic search

  const sentences = article.fullText.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const claimKeywords = claim.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  const relevantSentences = sentences
    .filter(sentence => {
      const sentenceLower = sentence.toLowerCase();
      // Sentence must contain at least 2 keywords from the claim
      const matchCount = claimKeywords.filter(kw => sentenceLower.includes(kw)).length;
      return matchCount >= Math.min(2, claimKeywords.length);
    })
    .slice(0, 3); // Take top 3 most relevant

  return relevantSentences.map(s => s.trim());
}

export function formatSourcesForPrompt(
  snippets: SourceSnippet[],
  deepSources: DeepSource[]
): string {
  let formatted = '';

  if (snippets.length > 0) {
    formatted += 'SNIPPET SOURCES (Quick Reference):\n';
    snippets.forEach((source, i) => {
      formatted += `\n${i + 1}. ${source.title}\n`;
      formatted += `   URL: ${source.url}\n`;
      formatted += `   Snippet: ${source.snippet}\n`;
    });
  }

  if (deepSources.length > 0) {
    formatted += '\n\nFULL ARTICLE SOURCES (Authoritative):\n';
    deepSources.forEach((source, i) => {
      formatted += `\n${i + 1}. ${source.title} (Authority: ${source.authorityScore}/10)\n`;
      formatted += `   URL: ${source.url}\n`;

      if (source.relevantPassages.length > 0) {
        formatted += `   Relevant passages:\n`;
        source.relevantPassages.forEach((passage, j) => {
          formatted += `   ${j + 1}. "${passage}"\n`;
        });
      } else {
        // Include first 500 chars of full text
        const preview = source.fullText.substring(0, 500) + '...';
        formatted += `   Content preview: ${preview}\n`;
      }
    });
  }

  if (formatted === '') {
    formatted = 'No sources found.';
  }

  return formatted;
}
