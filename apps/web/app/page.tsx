'use client';

import { useState, useEffect, useRef } from 'react';
import Script from 'next/script';

// New agentic verdict types
interface ClaimBreakdown {
  claim: string;
  verdict: string;
  key_evidence: string;
}

interface SourceCitation {
  url: string;
  title: string;
  publisher: string;
  credibility_tier: 1 | 2 | 3;
}

interface AgentVerdict {
  rating: string;
  summary: string;
  detailed_explanation: string;
  claims_breakdown?: ClaimBreakdown[];
  sources: SourceCitation[];
  confidence: number;
  needs_expert_review?: boolean;
}

interface ClarificationRequest {
  interpretations: string[];
  question: string;
}

interface AgentStats {
  iterations: number;
  searches: number;
  scrapes: number;
  toolCalls: number;
}

interface AgentCosts {
  total: number;
  claude: number;
  firecrawl: number;
  inputTokens: number;
  outputTokens: number;
}

interface AgentResult {
  verdict?: AgentVerdict;
  clarificationNeeded?: ClarificationRequest;
  stats: AgentStats;
  costs: AgentCosts;
  abortReason?: string;
}

interface ToolCallEvent {
  tool: string;
  input: Record<string, unknown>;
}

interface ToolResultEvent {
  tool: string;
  preview: string;
}

interface ThinkingEvent {
  iteration: number;
  thinking: string;
}

interface ProgressUpdate {
  type: string;
  message?: string;
  data?: unknown;
}

// TypeScript declaration for Twitter widget
declare global {
  interface Window {
    twttr?: {
      widgets: {
        load: (element?: HTMLElement) => void;
      };
    };
  }
}

// TweetEmbed component for displaying embedded tweets
function TweetEmbed({
  postUrl,
  postTimestamp,
  fallbackContent,
}: {
  postUrl: string;
  postTimestamp?: string;
  fallbackContent: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [embedLoaded, setEmbedLoaded] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);

  useEffect(() => {
    // Wait for Twitter widget script to load
    const loadEmbed = () => {
      if (window.twttr?.widgets && containerRef.current) {
        try {
          window.twttr.widgets.load(containerRef.current);
          setEmbedLoaded(true);
        } catch (error) {
          console.error('Failed to load tweet embed:', error);
          setEmbedFailed(true);
        }
      } else {
        // Retry after a short delay if widget not ready
        setTimeout(loadEmbed, 100);
      }
    };

    // Start loading after component mounts
    const timer = setTimeout(loadEmbed, 100);

    // Set a timeout to show fallback if embed takes too long
    const fallbackTimer = setTimeout(() => {
      if (!embedLoaded) {
        setEmbedFailed(true);
      }
    }, 5000);

    return () => {
      clearTimeout(timer);
      clearTimeout(fallbackTimer);
    };
  }, [embedLoaded]);

  if (embedFailed) {
    // Fallback to text display if embedding fails
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">Post Content</h2>
          {postTimestamp && (
            <span className="text-xs text-gray-500">
              Posted: {new Date(postTimestamp).toLocaleString()}
            </span>
          )}
        </div>
        <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
          {fallbackContent}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef}>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Post Content</h2>
      <blockquote
        className="twitter-tweet"
        data-dnt="true"
        data-theme="light"
        data-cards="hidden"
        data-conversation="none"
      >
        <a href={postUrl}>View Tweet</a>
      </blockquote>
      {!embedLoaded && (
        <div className="text-gray-700 bg-gray-50 p-4 rounded-lg animate-pulse">
          Loading tweet...
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const [postUrl, setPostUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [postContent, setPostContent] = useState<string>('');
  const [postTimestamp, setPostTimestamp] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<ProgressUpdate[]>([]);
  const [currentStage, setCurrentStage] = useState('');
  const [thinkingLog, setThinkingLog] = useState<ThinkingEvent[]>([]);
  const [toolCalls, setToolCalls] = useState<{call: ToolCallEvent, result?: ToolResultEvent}[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    setPostContent('');
    setPostTimestamp(undefined);
    setProgress([]);
    setCurrentStage('');
    setThinkingLog([]);
    setToolCalls([]);

    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ postUrl }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fact-check post');
      }

      // Handle SSE streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Response body is not readable');
      }

      let buffer = '';
      let currentEventType = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          // Parse SSE event format
          if (line.startsWith('event: ')) {
            currentEventType = line.slice(7).trim();
            continue;
          }
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            // Use the event type from the event: line, fallback to data.type
            const eventType = currentEventType || data.type || Object.keys(data)[0];
            currentEventType = ''; // Reset for next event

            switch (eventType) {
              case 'status':
                setProgress(prev => [...prev, { type: 'status', message: data.message }]);
                setCurrentStage(data.message || '');
                break;
              case 'post_content':
                setPostContent(data.content);
                setPostTimestamp(data.timestamp);
                break;
              case 'thinking':
                setThinkingLog(prev => [...prev, { iteration: data.iteration, thinking: data.thinking }]);
                setCurrentStage(`Thinking (iteration ${data.iteration})...`);
                break;
              case 'tool_call':
                setToolCalls(prev => [...prev, { call: { tool: data.name, input: data.input } }]);
                setCurrentStage(`Calling ${data.name}...`);
                break;
              case 'tool_result':
                setToolCalls(prev => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  if (lastIdx >= 0) {
                    updated[lastIdx] = { ...updated[lastIdx], result: { tool: data.name, preview: data.result } };
                  }
                  return updated;
                });
                break;
              case 'verdict':
                // Verdict submitted event
                setProgress(prev => [...prev, { type: 'verdict', data }]);
                break;
              case 'clarification':
                // Clarification needed
                setProgress(prev => [...prev, { type: 'clarification', data }]);
                break;
              case 'result':
                setResult({
                  verdict: data.verdict,
                  clarificationNeeded: data.clarificationNeeded,
                  stats: data.stats,
                  costs: data.costs,
                  abortReason: data.abortReason,
                });
                break;
              case 'error':
                throw new Error(data.error);
              case 'done':
                // Stream complete
                break;
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getVerdictColor = (verdict: string) => {
    const colors: Record<string, string> = {
      'True': 'text-green-600 bg-green-50',
      'Mostly True': 'text-green-600 bg-green-50',
      'Mixed': 'text-yellow-600 bg-yellow-50',
      'Missing Context': 'text-yellow-600 bg-yellow-50',
      'Mostly False': 'text-orange-600 bg-orange-50',
      'False': 'text-red-600 bg-red-50',
      'Unverifiable': 'text-gray-600 bg-gray-50',
      'Satire': 'text-purple-600 bg-purple-50',
    };
    return colors[verdict] || 'text-gray-600 bg-gray-50';
  };

  const getStageIcon = (stage: string) => {
    const icons: Record<string, string> = {
      'scraping': '📥',
      'claims': '🔍',
      'sources': '📚',
      'analysis': '🤖',
      'validation': '✅',
      'complete': '🎉',
    };
    return icons[stage] || '⏳';
  };

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      'scraping': 'Fetching Post',
      'claims': 'Extracting Claims',
      'sources': 'Gathering Sources',
      'analysis': 'Analyzing Evidence',
      'validation': 'Validating Results',
      'complete': 'Complete',
    };
    return labels[stage] || stage;
  };

  return (
    <>
      {/* Twitter Widget Script */}
      <Script
        src="https://platform.twitter.com/widgets.js"
        strategy="lazyOnload"
      />
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            X Fact-Checker
            <span className="ml-3 text-sm font-semibold px-3 py-1 bg-purple-600 text-white rounded-full">Agentic</span>
          </h1>
          <p className="text-lg text-gray-600">
            AI-Powered Autonomous Fact-Checking for X (Twitter) posts
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Powered by Claude + Firecrawl with credibility-tiered source gathering
          </p>
        </div>

        {/* Input Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <form onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Paste X Post URL
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://x.com/username/status/123456789"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !postUrl}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Analyzing...' : 'Fact-Check'}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Progress Indicator */}
        {loading && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex-shrink-0">
                <div className="animate-spin h-6 w-6 border-2 border-purple-600 border-t-transparent rounded-full"></div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 text-lg">
                  {currentStage || 'Starting...'}
                </div>
              </div>
            </div>

            {/* Tool Calls Log */}
            {toolCalls.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Agent Activity</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {toolCalls.slice(-5).map((tc, idx) => (
                    <div key={idx} className="text-sm">
                      <span className="font-mono text-purple-600">{tc.call.tool}</span>
                      {tc.call.input.query && (
                        <span className="text-gray-500 ml-2">
                          &quot;{String(tc.call.input.query).substring(0, 50)}...&quot;
                        </span>
                      )}
                      {tc.result && (
                        <span className="text-green-600 ml-2">✓</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
            {/* Post Content */}
            {postContent && (
              <TweetEmbed
                postUrl={postUrl}
                postTimestamp={postTimestamp}
                fallbackContent={postContent}
              />
            )}

            {/* Abort Reason (if agent stopped early) */}
            {result.abortReason && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-yellow-900 mb-1">Agent Stopped</h3>
                <p className="text-sm text-yellow-700">{result.abortReason}</p>
              </div>
            )}

            {/* Clarification Needed */}
            {result.clarificationNeeded && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Clarification Needed</h3>
                <p className="text-gray-700 mb-3">{result.clarificationNeeded.question}</p>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-600">Possible interpretations:</p>
                  <ul className="list-disc list-inside text-gray-700">
                    {result.clarificationNeeded.interpretations.map((interp, i) => (
                      <li key={i}>{interp}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Verdict */}
            {result.verdict && (
              <>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">Verdict</h2>
                  <div className={`inline-block px-4 py-2 rounded-full font-semibold ${getVerdictColor(result.verdict.rating)}`}>
                    {result.verdict.rating}
                  </div>
                  {result.verdict.needs_expert_review && (
                    <span className="ml-3 px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm">
                      Needs Expert Review
                    </span>
                  )}
                </div>

                {/* Confidence */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm font-medium text-gray-600 mb-2">Confidence Level</div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-green-500 h-3 rounded-full transition-all"
                        style={{ width: `${result.verdict.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xl font-semibold text-gray-700">
                      {Math.round(result.verdict.confidence * 100)}%
                    </span>
                  </div>
                </div>

                {/* Summary */}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">Summary</h2>
                  <p className="text-gray-700">{result.verdict.summary}</p>
                </div>

                {/* Detailed Explanation */}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">Detailed Explanation</h2>
                  <div className="bg-gray-50 p-4 rounded-lg text-gray-700 whitespace-pre-wrap">
                    {result.verdict.detailed_explanation}
                  </div>
                </div>

                {/* Claims Breakdown */}
                {result.verdict.claims_breakdown && result.verdict.claims_breakdown.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">Claims Breakdown</h2>
                    <div className="space-y-3">
                      {result.verdict.claims_breakdown.map((cb, index) => (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <p className="text-sm font-medium text-gray-800 flex-1">{cb.claim}</p>
                            <span className={`ml-3 px-3 py-1 rounded-full text-xs font-semibold ${getVerdictColor(cb.verdict)}`}>
                              {cb.verdict}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">{cb.key_evidence}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources */}
                {result.verdict.sources && result.verdict.sources.length > 0 && (
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 mb-3">
                      Sources ({result.verdict.sources.length})
                    </h2>
                    <div className="space-y-3">
                      {result.verdict.sources.map((source, index) => (
                        <div
                          key={index}
                          className={`border-l-4 rounded-lg p-4 ${
                            source.credibility_tier === 1
                              ? 'border-green-500 bg-green-50'
                              : source.credibility_tier === 2
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-400 bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold px-2 py-1 rounded ${
                              source.credibility_tier === 1
                                ? 'bg-green-200 text-green-800'
                                : source.credibility_tier === 2
                                ? 'bg-blue-200 text-blue-800'
                                : 'bg-gray-200 text-gray-800'
                            }`}>
                              Tier {source.credibility_tier}
                            </span>
                            <span className="text-xs text-gray-600">{source.publisher}</span>
                          </div>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {source.title}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Stats and Costs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{result.stats.iterations}</div>
                <div className="text-xs text-gray-500">Iterations</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{result.stats.searches}</div>
                <div className="text-xs text-gray-500">Searches</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{result.stats.scrapes}</div>
                <div className="text-xs text-gray-500">Pages Scraped</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">${result.costs.total.toFixed(3)}</div>
                <div className="text-xs text-gray-500">Total Cost</div>
              </div>
            </div>

            {/* Timestamp */}
            <div className="text-sm text-gray-500 text-right">
              Analysis completed at {new Date().toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
