// Tool definitions for the fact-checking agent

import type Anthropic from '@anthropic-ai/sdk';

// Verdict ratings
export type VerdictRating =
  | 'True'
  | 'Mostly True'
  | 'Mixed'
  | 'Mostly False'
  | 'False'
  | 'Unverifiable'
  | 'Satire'
  | 'Missing Context';

// Tool input types
export interface SearchInput {
  query: string;
  get_full_content?: boolean;
  for_quote_verification?: boolean;
}

export interface ScrapeUrlInput {
  url: string;
}

export interface ScrapeMultipleInput {
  urls: string[];
}

export interface ClaimBreakdown {
  claim: string;
  verdict: string;
  key_evidence: string;
}

export interface SourceCitation {
  url: string;
  title: string;
  publisher: string;
  credibility_tier: 1 | 2 | 3;
}

export interface SubmitVerdictInput {
  rating: VerdictRating;
  summary: string;
  detailed_explanation: string;
  claims_breakdown?: ClaimBreakdown[];
  sources: SourceCitation[];
  confidence: number;
  needs_expert_review?: boolean;
}

export interface RequestClarificationInput {
  interpretations: string[];
  question: string;
}

export interface ConcludeInput {
  summary: string;  // Brief summary of evidence gathered
}

// Evidence gathering tools (used in main loop)
export const EVIDENCE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search',
    description: 'Search for credible sources. Results sorted by tier (1=gov/academic, 2=fact-checkers, 3=news). Query tips: statistics→include numbers/year, quotes→exact phrase in quotes, fact-checks→add site:snopes.com OR site:politifact.com',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        get_full_content: { type: 'boolean', description: 'Scrape full article text' },
        for_quote_verification: { type: 'boolean', description: 'Include social media for verifying quotes (not facts)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'scrape_url',
    description: 'Get full article content from URL',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: 'scrape_multiple',
    description: 'Batch scrape up to 10 URLs',
    input_schema: {
      type: 'object',
      properties: { urls: { type: 'array', items: { type: 'string' }, maxItems: 10 } },
      required: ['urls'],
    },
  },
  {
    name: 'request_clarification',
    description: 'Ask user for clarification when claim is ambiguous',
    input_schema: {
      type: 'object',
      properties: {
        interpretations: { type: 'array', items: { type: 'string' } },
        question: { type: 'string' },
      },
      required: ['interpretations', 'question'],
    },
  },
  {
    name: 'conclude',
    description: 'Call when you have gathered enough evidence to make a verdict. Exits the evidence-gathering phase.',
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Brief summary of key evidence gathered' },
      },
      required: ['summary'],
    },
  },
];

// Verdict tool (used after evidence gathering)
export const VERDICT_TOOL: Anthropic.Tool = {
  name: 'submit_verdict',
  description: 'Submit final verdict with evidence. You MUST call this tool.',
  input_schema: {
    type: 'object',
    properties: {
      rating: {
        type: 'string',
        enum: ['True', 'Mostly True', 'Mixed', 'Mostly False', 'False', 'Unverifiable', 'Satire', 'Missing Context'],
      },
      summary: { type: 'string', description: '2-3 sentence summary' },
      detailed_explanation: { type: 'string', description: 'Full reasoning with source citations' },
      claims_breakdown: {
        type: 'array',
        items: {
          type: 'object',
          properties: { claim: { type: 'string' }, verdict: { type: 'string' }, key_evidence: { type: 'string' } },
          required: ['claim', 'verdict', 'key_evidence'],
        },
      },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            publisher: { type: 'string' },
            credibility_tier: { type: 'number', enum: [1, 2, 3] },
          },
          required: ['url', 'title', 'publisher', 'credibility_tier'],
        },
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      needs_expert_review: { type: 'boolean' },
    },
    required: ['rating', 'summary', 'detailed_explanation', 'sources', 'confidence'],
  },
};

// Legacy export for backwards compatibility
export const TOOL_DEFINITIONS = [...EVIDENCE_TOOLS, VERDICT_TOOL];

// Type guard for tool inputs
export function isSearchInput(input: unknown): input is SearchInput {
  return typeof input === 'object' && input !== null && 'query' in input;
}

export function isScrapeUrlInput(input: unknown): input is ScrapeUrlInput {
  return typeof input === 'object' && input !== null && 'url' in input;
}

export function isScrapeMultipleInput(input: unknown): input is ScrapeMultipleInput {
  return typeof input === 'object' && input !== null && 'urls' in input && Array.isArray((input as any).urls);
}

export function isSubmitVerdictInput(input: unknown): input is SubmitVerdictInput {
  return typeof input === 'object' && input !== null && 'rating' in input && 'summary' in input;
}

export function isRequestClarificationInput(input: unknown): input is RequestClarificationInput {
  return typeof input === 'object' && input !== null && 'interpretations' in input && 'question' in input;
}

export function isConcludeInput(input: unknown): input is ConcludeInput {
  return typeof input === 'object' && input !== null && 'summary' in input;
}
