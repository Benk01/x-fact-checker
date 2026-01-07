// Structured logging utility for fact-check operations
import fs from 'fs';
import path from 'path';

export interface FactCheckLog {
  id: string; // Unique ID for each log entry
  timestamp: string;
  postUrl: string;
  postContent: string;
  contentLength: number;
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
  metadata: {
    scrapeDurationMs: number;
    analysisDurationMs: number;
    searchDurationMs: number;
    totalDurationMs: number;
    anthropicTokensUsed?: {
      input: number;
      output: number;
    };
    cost?: {
      scraping: number;
      analysis: number;
      search: number;
      total: number;
    };
  };
  success: boolean;
  errorMessage?: string;
}

export class FactCheckLogger {
  private static logsDir = path.join(process.cwd(), 'logs');
  private static logsFile = path.join(this.logsDir, 'fact-checks.jsonl'); // JSON Lines format

  // Ensure logs directory exists
  private static ensureLogsDir(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  // Generate unique ID for log entry
  private static generateId(): string {
    return `fc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  static log(logData: Omit<FactCheckLog, 'id'>): void {
    this.ensureLogsDir();

    const entry: FactCheckLog = {
      id: this.generateId(),
      ...logData,
    };

    // Append to JSON Lines file (one JSON object per line)
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.logsFile, logLine, 'utf-8');

    // Also print a condensed summary to console
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📊 FACT-CHECK ${entry.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🆔 ID: ${entry.id}`);
    console.log(`🔗 URL: ${entry.postUrl}`);
    console.log(`📝 Content: ${entry.postContent.substring(0, 100)}${entry.postContent.length > 100 ? '...' : ''}`);

    if (entry.success) {
      console.log(`\n🎯 VERDICT: ${entry.analysis.verdict}`);
      console.log(`   Accuracy: ${entry.analysis.factualAccuracy}/10 | Context: ${entry.analysis.contextScore}/10 | Sources: ${entry.analysis.sourceQuality}/10`);
      console.log(`   Confidence: ${entry.analysis.confidence}%`);
      console.log(`\n💰 COST: $${entry.metadata.cost?.total.toFixed(4)} (${entry.metadata.anthropicTokensUsed?.input}→${entry.metadata.anthropicTokensUsed?.output} tokens)`);
      console.log(`⏱️  TIME: ${entry.metadata.totalDurationMs}ms total (scrape: ${entry.metadata.scrapeDurationMs}ms, analysis: ${entry.metadata.analysisDurationMs}ms)`);
      console.log(`📚 SOURCES: ${entry.sources.length} found`);
    } else {
      console.log(`\n❌ ERROR: ${entry.errorMessage}`);
      console.log(`⏱️  TIME: ${entry.metadata.totalDurationMs}ms`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  static getAllLogs(): FactCheckLog[] {
    this.ensureLogsDir();

    if (!fs.existsSync(this.logsFile)) {
      return [];
    }

    const fileContent = fs.readFileSync(this.logsFile, 'utf-8');
    const lines = fileContent.trim().split('\n').filter(line => line.length > 0);

    return lines.map(line => JSON.parse(line));
  }

  static getLogById(id: string): FactCheckLog | null {
    const logs = this.getAllLogs();
    return logs.find(log => log.id === id) || null;
  }

  static getLogsByDateRange(startDate: Date, endDate: Date): FactCheckLog[] {
    const logs = this.getAllLogs();
    return logs.filter(log => {
      const logDate = new Date(log.timestamp);
      return logDate >= startDate && logDate <= endDate;
    });
  }

  static getLogsByVerdict(verdict: string): FactCheckLog[] {
    const logs = this.getAllLogs();
    return logs.filter(log => log.success && log.analysis.verdict === verdict);
  }

  static getStats() {
    const logs = this.getAllLogs();
    const successfulLogs = logs.filter(log => log.success);
    const failedLogs = logs.filter(log => !log.success);

    return {
      total: logs.length,
      successful: successfulLogs.length,
      failed: failedLogs.length,
      averageDuration: successfulLogs.length > 0
        ? successfulLogs.reduce((sum, log) => sum + log.metadata.totalDurationMs, 0) / successfulLogs.length
        : 0,
      totalCost: successfulLogs.reduce((sum, log) => sum + (log.metadata.cost?.total || 0), 0),
      averageCost: successfulLogs.length > 0
        ? successfulLogs.reduce((sum, log) => sum + (log.metadata.cost?.total || 0), 0) / successfulLogs.length
        : 0,
      verdictBreakdown: {
        Accurate: successfulLogs.filter(l => l.analysis.verdict === 'Accurate').length,
        'Mostly Accurate': successfulLogs.filter(l => l.analysis.verdict === 'Mostly Accurate').length,
        'Misleading': successfulLogs.filter(l => l.analysis.verdict === 'Misleading').length,
        'Mostly False': successfulLogs.filter(l => l.analysis.verdict === 'Mostly False').length,
        'False': successfulLogs.filter(l => l.analysis.verdict === 'False').length,
        'Unverifiable': successfulLogs.filter(l => l.analysis.verdict === 'Unverifiable').length,
      },
      totalTokensUsed: {
        input: successfulLogs.reduce((sum, log) => sum + (log.metadata.anthropicTokensUsed?.input || 0), 0),
        output: successfulLogs.reduce((sum, log) => sum + (log.metadata.anthropicTokensUsed?.output || 0), 0),
      },
    };
  }

  static clearLogs(): void {
    this.ensureLogsDir();
    if (fs.existsSync(this.logsFile)) {
      fs.unlinkSync(this.logsFile);
    }
  }

  static exportToJson(outputPath: string): void {
    const logs = this.getAllLogs();
    fs.writeFileSync(outputPath, JSON.stringify(logs, null, 2), 'utf-8');
  }

  static getRecentLogs(limit: number = 10): FactCheckLog[] {
    const logs = this.getAllLogs();
    return logs.slice(-limit).reverse(); // Get last N logs, most recent first
  }
}
