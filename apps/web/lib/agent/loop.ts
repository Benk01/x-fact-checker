// Agent loop orchestration - runs the fact-checking agent

import Anthropic from '@anthropic-ai/sdk';
import { EVIDENCE_TOOLS, VERDICT_TOOL, type SubmitVerdictInput, type RequestClarificationInput, type ConcludeInput } from './tools';
import { SYSTEM_PROMPT, createUserMessage } from './prompts';
import { ToolExecutor } from './executor';
import { CostTracker, type CostBreakdown, type UsageStats } from '../costs/tracker';
import { type ExtractedXPost } from '../types';

// Agent configuration
export interface AgentConfig {
  maxIterations: number;      // Max agent turns
  maxSearches: number;        // Max search calls
  maxCostUsd: number;         // Budget limit
  model: string;              // Claude model for analysis
  fastModel: string;          // Cheaper model for search iterations
}

const DEFAULT_CONFIG: AgentConfig = {
  maxIterations: 8,
  maxSearches: 5,
  maxCostUsd: 0.25,
  model: 'claude-sonnet-4-5-20250929',
  fastModel: 'claude-haiku-4-5-20251001',  // 75% cheaper for search iterations
};

// Trace entry for debugging
export interface TraceEntry {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'message';
  timestamp: number;
  data: unknown;
}

// Agent result
export interface AgentResult {
  verdict: SubmitVerdictInput | null;
  clarificationNeeded: RequestClarificationInput | null;
  trace: TraceEntry[];
  stats: UsageStats;
  costs: CostBreakdown;
  abortReason?: string;
}

// Event emitter for streaming
export type AgentEventType = 'thinking' | 'tool_call' | 'tool_result' | 'verdict' | 'clarification' | 'complete' | 'error';

export interface AgentEvent {
  type: AgentEventType;
  data: unknown;
}

export type AgentEventCallback = (event: AgentEvent) => void;

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function runFactCheckAgent(
  post: ExtractedXPost,
  postUrl: string,
  config: Partial<AgentConfig> = {},
  onEvent?: AgentEventCallback
): Promise<AgentResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Initialize tracking
  const costTracker = new CostTracker(cfg.maxCostUsd);
  const executor = new ToolExecutor({
    maxSearches: cfg.maxSearches,
    costTracker,
  });
  const trace: TraceEntry[] = [];

  // Conversation messages
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: createUserMessage(post, postUrl),
    },
  ];

  let verdict: SubmitVerdictInput | null = null;
  let clarificationNeeded: RequestClarificationInput | null = null;
  let concludeReason: ConcludeInput | null = null;
  let abortReason: string | undefined;

  console.log('\n🤖 Starting fact-check agent...');
  console.log(`   Post: ${post.text.substring(0, 100)}...`);
  console.log(`   Author: @${post.author.username}`);
  console.log(`   Config: ${cfg.maxIterations} iterations, ${cfg.maxSearches} searches, $${cfg.maxCostUsd} budget`);

  // ========== PHASE 1: Evidence Gathering ==========
  console.log('\n📚 Phase 1: Evidence Gathering');

  for (let iteration = 0; iteration < cfg.maxIterations; iteration++) {
    costTracker.incrementIteration();

    // Determine which model to use
    const useHaiku = iteration < 3 && !verdict;
    const currentModel = useHaiku ? cfg.fastModel : cfg.model;
    const modelName = useHaiku ? '🐇 Haiku (fast/cheap)' : '🎭 Sonnet (analysis)';

    console.log(`\n--- Iteration ${iteration + 1}/${cfg.maxIterations} [${modelName}] ---`);

    // Check budget
    if (costTracker.isOverBudget()) {
      abortReason = 'Budget limit reached';
      console.log(`⚠️ ${abortReason}`);
      break;
    }

    // Emit thinking event
    const thinkingEvent = { type: 'thinking' as const, iteration: iteration + 1 };
    trace.push({ type: 'thinking', timestamp: Date.now(), data: thinkingEvent });
    onEvent?.({ type: 'thinking', data: thinkingEvent });

    try {
      // Call Claude with prompt caching (evidence gathering tools only)
      const response = await anthropic.messages.create({
        model: currentModel,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },  // Cache for 5 min
          },
        ],
        tools: EVIDENCE_TOOLS.map((tool, i) =>
          i === EVIDENCE_TOOLS.length - 1
            ? { ...tool, cache_control: { type: 'ephemeral' } }  // Cache breakpoint
            : tool
        ),
        messages,
      });

      // Track token usage
      costTracker.addClaudeUsage(response.usage.input_tokens, response.usage.output_tokens);
      const cacheRead = (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens || 0;
      const cacheCreated = (response.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens || 0;
      const cacheInfo = cacheRead > 0 ? ` | 💾 cache hit: ${cacheRead} tokens` : (cacheCreated > 0 ? ` | 💾 cache created: ${cacheCreated} tokens` : '');
      console.log(`   📊 Tokens: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out${cacheInfo}`);

      // Process response content
      const assistantContent: Anthropic.ContentBlock[] = [];
      let hasToolUse = false;

      for (const block of response.content) {
        assistantContent.push(block);

        if (block.type === 'text') {
          console.log(`   Claude: ${block.text.substring(0, 200)}...`);
          trace.push({ type: 'message', timestamp: Date.now(), data: block.text });
        }

        if (block.type === 'tool_use') {
          hasToolUse = true;
          const toolName = block.name;
          const toolInput = block.input;

          console.log(`   Tool call: ${toolName}`);

          // Emit tool call event
          const toolCallEvent = { name: toolName, input: toolInput, id: block.id };
          trace.push({ type: 'tool_call', timestamp: Date.now(), data: toolCallEvent });
          onEvent?.({ type: 'tool_call', data: toolCallEvent });

          // Execute tool
          const result = await executor.execute(toolName, toolInput);

          // Emit tool result event
          const toolResultEvent = { name: toolName, result, id: block.id };
          trace.push({ type: 'tool_result', timestamp: Date.now(), data: toolResultEvent });
          onEvent?.({ type: 'tool_result', data: toolResultEvent });

          // Check for conclude or clarification (early exit from evidence gathering)
          if (toolName === 'conclude' && result.success) {
            concludeReason = result.data as ConcludeInput;
            console.log(`\n✅ Evidence complete: ${concludeReason.summary.substring(0, 100)}...`);
            break;
          }

          if (toolName === 'request_clarification' && result.success) {
            clarificationNeeded = result.data as RequestClarificationInput;
            console.log(`\n❓ Clarification needed: ${clarificationNeeded.question}`);
            onEvent?.({ type: 'clarification', data: clarificationNeeded });
            break;
          }

          // Compress search results to reduce token usage in history
          let compressedResult = result;
          if (toolName === 'search' && result.success && result.data) {
            const data = result.data as { results?: Array<{ url: string; title: string; credibility_tier: number }> };
            compressedResult = {
              success: true,
              data: {
                result_count: data.results?.length || 0,
                top_sources: data.results?.slice(0, 5).map(r => ({
                  url: r.url,
                  title: r.title?.substring(0, 60),
                  tier: r.credibility_tier,
                })),
              },
            };
          }

          // Compress scrape results - keep summary, not full content
          if ((toolName === 'scrape_url' || toolName === 'scrape_multiple') && result.success && result.data) {
            if (toolName === 'scrape_url') {
              const data = result.data as { url: string; title: string; content: string; credibility_tier: number };
              compressedResult = {
                success: true,
                data: {
                  url: data.url,
                  title: data.title,
                  credibility_tier: data.credibility_tier,
                  content_preview: data.content?.substring(0, 500) + '...',
                },
              };
            } else {
              // scrape_multiple
              const data = result.data as { results: Array<{ url: string; title: string; content: string; credibility_tier: number }> };
              compressedResult = {
                success: true,
                data: {
                  scraped_count: data.results?.length || 0,
                  sources: data.results?.map(r => ({
                    url: r.url,
                    title: r.title,
                    tier: r.credibility_tier,
                    preview: r.content?.substring(0, 300) + '...',
                  })),
                },
              };
            }
          }

          // Add assistant message and compressed tool result
          messages.push({ role: 'assistant', content: assistantContent });
          messages.push({
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(compressedResult),
              },
            ],
          });

          // Reset assistantContent for next iteration
          break; // Process one tool at a time
        }
      }

      // If conclude or clarification found, exit evidence gathering loop
      if (concludeReason || clarificationNeeded) {
        break;
      }

      // If no tool use and stop reason is 'end_turn', agent is done gathering evidence
      if (!hasToolUse && response.stop_reason === 'end_turn') {
        messages.push({ role: 'assistant', content: assistantContent });
        console.log('\n   Agent stopped using tools - moving to verdict phase');
        break;
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error in iteration ${iteration + 1}: ${errorMessage}`);

      onEvent?.({ type: 'error', data: { iteration: iteration + 1, error: errorMessage } });

      // Continue to next iteration on recoverable errors
      if (iteration < cfg.maxIterations - 1) {
        continue;
      }

      abortReason = `Error: ${errorMessage}`;
      break;
    }
  }

  // ========== PHASE 2: Verdict Submission ==========
  // Skip if clarification needed or error occurred
  if (!clarificationNeeded && !abortReason) {
    console.log('\n⚖️ Phase 2: Verdict Submission');

    // Add prompt for verdict
    messages.push({
      role: 'user',
      content: 'Based on all the evidence gathered, submit your final verdict using the submit_verdict tool. You MUST call submit_verdict now.',
    });

    try {
      // Call Claude with only the verdict tool (forces verdict submission)
      const verdictResponse = await anthropic.messages.create({
        model: cfg.model,  // Always use Sonnet for verdict
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        tools: [{ ...VERDICT_TOOL, cache_control: { type: 'ephemeral' } }],
        tool_choice: { type: 'tool', name: 'submit_verdict' },  // Force tool use
        messages,
      });

      // Track token usage
      costTracker.addClaudeUsage(verdictResponse.usage.input_tokens, verdictResponse.usage.output_tokens);
      const cacheRead = (verdictResponse.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens || 0;
      const cacheInfo = cacheRead > 0 ? ` | 💾 cache hit: ${cacheRead} tokens` : '';
      console.log(`   📊 Verdict tokens: ${verdictResponse.usage.input_tokens} in, ${verdictResponse.usage.output_tokens} out${cacheInfo}`);

      // Extract verdict from response
      for (const block of verdictResponse.content) {
        if (block.type === 'tool_use' && block.name === 'submit_verdict') {
          const result = await executor.execute('submit_verdict', block.input);
          if (result.success) {
            verdict = result.data as SubmitVerdictInput;
            console.log(`\n✅ Verdict: ${verdict.rating}`);
            onEvent?.({ type: 'verdict', data: verdict });

            // Emit tool events for UI
            onEvent?.({ type: 'tool_call', data: { name: 'submit_verdict', input: block.input, id: block.id } });
            onEvent?.({ type: 'tool_result', data: { name: 'submit_verdict', result, id: block.id } });
          }
        }
      }

      if (!verdict) {
        abortReason = 'Failed to extract verdict from response';
        console.log(`⚠️ ${abortReason}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      abortReason = `Verdict phase error: ${errorMessage}`;
      console.error(`⚠️ ${abortReason}`);
    }
  }

  // Compile final result
  const stats = costTracker.getUsageStats();
  const costs = costTracker.getCosts();

  console.log(`\n📊 Final stats:`);
  console.log(`   Iterations: ${stats.iterations}`);
  console.log(`   Searches: ${stats.searchCount}`);
  console.log(`   Duration: ${stats.durationMs}ms`);
  console.log(`   Cost: ${costTracker.getFormattedCosts()}`);

  const result: AgentResult = {
    verdict,
    clarificationNeeded,
    trace,
    stats,
    costs,
    abortReason,
  };

  onEvent?.({ type: 'complete', data: result });

  return result;
}
