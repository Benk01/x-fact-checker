// Tool executor - handles execution of agent tools

import { search, scrapeUrl, scrapeMultiple, type SearchResult, type ScrapeResult } from '../firecrawl';
import { CostTracker } from '../costs/tracker';
import {
  type SearchInput,
  type ScrapeUrlInput,
  type ScrapeMultipleInput,
  type SubmitVerdictInput,
  type RequestClarificationInput,
  type ConcludeInput,
  isSearchInput,
  isScrapeUrlInput,
  isScrapeMultipleInput,
  isSubmitVerdictInput,
  isRequestClarificationInput,
  isConcludeInput,
} from './tools';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ExecutorConfig {
  maxSearches: number;
  costTracker: CostTracker;
}

export class ToolExecutor {
  private searchCount = 0;
  private config: ExecutorConfig;
  private lastSearchQuery = '';  // Track for smart extraction

  constructor(config: ExecutorConfig) {
    this.config = config;
  }

  async execute(toolName: string, toolInput: unknown): Promise<ToolResult> {
    console.log(`\n🔧 Executing tool: ${toolName}`);

    try {
      switch (toolName) {
        case 'search':
          return await this.executeSearch(toolInput);
        case 'scrape_url':
          return await this.executeScrapeUrl(toolInput);
        case 'scrape_multiple':
          return await this.executeScrapeMultiple(toolInput);
        case 'submit_verdict':
          return this.executeSubmitVerdict(toolInput);
        case 'request_clarification':
          return this.executeRequestClarification(toolInput);
        case 'conclude':
          return this.executeConclude(toolInput);
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Tool execution failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  private async executeSearch(input: unknown): Promise<ToolResult> {
    if (!isSearchInput(input)) {
      return { success: false, error: 'Invalid search input' };
    }

    // Check search limit
    if (this.searchCount >= this.config.maxSearches) {
      return {
        success: false,
        error: `Search limit reached (${this.config.maxSearches}). Please submit your verdict with the evidence you have.`,
      };
    }

    // Check budget
    if (this.config.costTracker.isOverBudget()) {
      return {
        success: false,
        error: 'Budget limit reached. Please submit your verdict with the evidence you have.',
      };
    }

    const searchInput = input as SearchInput;
    this.searchCount++;
    this.config.costTracker.addSearch();
    this.lastSearchQuery = searchInput.query;  // Store for smart extraction

    const results = await search(searchInput.query, {
      limit: 15,
      getFullContent: searchInput.get_full_content,
      forQuoteVerification: searchInput.for_quote_verification,
    });

    // Format results for the agent
    const formattedResults = results.map(r => ({
      url: r.url,
      title: r.title,
      description: r.description,
      credibility_tier: r.credibilityTier,
      domain: r.domain,
      ...(r.isSocialMedia && { is_primary_source_social: true }),
      ...(r.markdown && { content_preview: r.markdown.substring(0, 500) + '...' }),
    }));

    return {
      success: true,
      data: {
        query: searchInput.query,
        result_count: formattedResults.length,
        searches_remaining: this.config.maxSearches - this.searchCount,
        results: formattedResults,
      },
    };
  }

  private async executeScrapeUrl(input: unknown): Promise<ToolResult> {
    if (!isScrapeUrlInput(input)) {
      return { success: false, error: 'Invalid scrape_url input' };
    }

    if (this.config.costTracker.isOverBudget()) {
      return { success: false, error: 'Budget limit reached' };
    }

    const scrapeInput = input as ScrapeUrlInput;
    this.config.costTracker.addScrape();

    // Extract keywords from last search query for smart extraction
    const keywords = this.extractKeywords(this.lastSearchQuery);
    const result = await scrapeUrl(scrapeInput.url, keywords);

    if (!result) {
      return { success: false, error: 'Failed to scrape URL' };
    }

    return {
      success: true,
      data: {
        url: result.url,
        title: result.title,
        credibility_tier: result.credibilityTier,
        domain: result.domain,
        content: result.markdown,
      },
    };
  }

  private async executeScrapeMultiple(input: unknown): Promise<ToolResult> {
    if (!isScrapeMultipleInput(input)) {
      return { success: false, error: 'Invalid scrape_multiple input' };
    }

    if (this.config.costTracker.isOverBudget()) {
      return { success: false, error: 'Budget limit reached' };
    }

    const scrapeInput = input as ScrapeMultipleInput;
    const urls = scrapeInput.urls.slice(0, 10);
    this.config.costTracker.addScrape(urls.length);

    // Extract keywords from last search query for smart extraction
    const keywords = this.extractKeywords(this.lastSearchQuery);
    const results = await scrapeMultiple(urls, keywords);

    return {
      success: true,
      data: {
        requested: urls.length,
        successful: results.length,
        results: results.map(r => ({
          url: r.url,
          title: r.title,
          credibility_tier: r.credibilityTier,
          domain: r.domain,
          content: r.markdown,
        })),
      },
    };
  }

  private executeSubmitVerdict(input: unknown): ToolResult {
    if (!isSubmitVerdictInput(input)) {
      return { success: false, error: 'Invalid submit_verdict input' };
    }

    // Verdict is valid - return it as data
    return {
      success: true,
      data: input as SubmitVerdictInput,
    };
  }

  private executeRequestClarification(input: unknown): ToolResult {
    if (!isRequestClarificationInput(input)) {
      return { success: false, error: 'Invalid request_clarification input' };
    }

    return {
      success: true,
      data: input as RequestClarificationInput,
    };
  }

  private executeConclude(input: unknown): ToolResult {
    if (!isConcludeInput(input)) {
      return { success: false, error: 'Invalid conclude input' };
    }

    return {
      success: true,
      data: input as ConcludeInput,
    };
  }

  getSearchCount(): number {
    return this.searchCount;
  }

  /**
   * Extract meaningful keywords from a search query for smart content extraction.
   */
  private extractKeywords(query: string): string[] {
    return query
      .replace(/site:\S+/g, '')     // Remove site: operators
      .replace(/OR|AND/g, '')       // Remove boolean operators
      .replace(/["']/g, '')         // Remove quotes
      .split(/\s+/)
      .filter(w => w.length > 3)    // Keep meaningful words
      .slice(0, 10);                // Limit to 10 keywords
  }
}
