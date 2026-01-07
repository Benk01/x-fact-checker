// Test script for V2 fact-checking endpoint
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function testFactCheck(postUrl) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TESTING V2 FACT-CHECK ENDPOINT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📌 URL: ${postUrl}\n`);

  const startTime = Date.now();

  try {
    const response = await fetch('http://localhost:3001/api/fact-check-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ postUrl }),
    });

    const totalTime = Date.now() - startTime;

    if (!response.ok) {
      const error = await response.json();
      console.log('❌ ERROR:', error.error);
      console.log(`⏱️  Time: ${totalTime}ms\n`);
      return;
    }

    const result = await response.json();

    // Display results
    console.log('✅ SUCCESS');
    console.log(`⏱️  Total Time: ${totalTime}ms`);
    console.log('\n📝 POST CONTENT:');
    console.log(`"${result.postContent}"`);

    console.log('\n🔍 CLAIMS EXTRACTED:', result.claims.length);
    result.claims.forEach((claim, i) => {
      console.log(`  ${i + 1}. [${claim.priority.toUpperCase()}] ${claim.text}`);
      console.log(`     Type: ${claim.type} | Full Read: ${claim.requiresFullSourceRead}`);
      console.log(`     Search: "${claim.searchQuery}"`);
    });

    console.log('\n📚 SOURCES GATHERED:');
    console.log(`  Snippets: ${result.sources.snippets.length}`);
    console.log(`  Full Articles: ${result.sources.deep.length}`);
    if (result.sources.deep.length > 0) {
      result.sources.deep.forEach(source => {
        console.log(`    - ${source.title} (Authority: ${source.authorityScore}/10)`);
      });
    }

    console.log('\n🎯 ANALYSIS:');
    console.log(`  Verdict: ${result.analysis.verdict}`);
    console.log(`  Factual Accuracy: ${result.analysis.factualAccuracy}/10`);
    console.log(`  Context Score: ${result.analysis.contextScore}/10`);
    console.log(`  Source Quality: ${result.analysis.sourceQuality}/10`);
    console.log(`  Confidence: ${result.analysis.confidence}%`);

    console.log('\n📊 PER-CLAIM ANALYSIS:');
    result.analysis.claimAnalysis.forEach((ca, i) => {
      console.log(`  ${i + 1}. "${ca.claim}"`);
      console.log(`     Verdict: ${ca.verdict}`);
      console.log(`     Evidence: ${ca.evidence.substring(0, 150)}${ca.evidence.length > 150 ? '...' : ''}`);
    });

    console.log('\n💭 SUMMARY:');
    console.log(`  ${result.analysis.summary}`);

    if (result.analysis.keyIssues && result.analysis.keyIssues.length > 0) {
      console.log('\n⚠️  KEY ISSUES:');
      result.analysis.keyIssues.forEach((issue, i) => {
        console.log(`  ${i + 1}. ${issue}`);
      });
    }

    console.log('\n🔍 VALIDATION:');
    console.log(`  Valid: ${result.validation.isValid ? '✅' : '❌'}`);
    console.log(`  Needs Human Review: ${result.validation.needsHumanReview ? '⚠️  YES' : '✅ NO'}`);
    if (result.validation.issues.length > 0) {
      console.log('  Issues:', result.validation.issues);
    }
    if (result.validation.warnings.length > 0) {
      console.log('  Warnings:', result.validation.warnings);
    }

    console.log('\n📈 PERFORMANCE:');
    console.log(`  Scrape: ${result.metadata.performance.scrapeDurationMs}ms`);
    console.log(`  Claim Extraction: ${result.metadata.performance.claimExtractionMs}ms`);
    console.log(`  Source Gathering: ${result.metadata.performance.sourceGatheringMs}ms`);
    console.log(`  Analysis: ${result.metadata.performance.analysisMs}ms`);
    console.log(`  Validation: ${result.metadata.performance.validationMs}ms`);
    console.log(`  TOTAL: ${result.metadata.performance.totalDurationMs}ms`);

    console.log('\n💰 COSTS:');
    console.log(`  Analysis: $${result.metadata.costs.analysis.toFixed(4)}`);
    console.log(`  Search: $${result.metadata.costs.search.toFixed(4)}`);
    console.log(`  Article Fetch: $${result.metadata.costs.articleFetch.toFixed(4)}`);
    console.log(`  TOTAL: $${result.metadata.costs.total.toFixed(4)}`);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.log('❌ REQUEST FAILED:', error.message);
    console.log(`⏱️  Time: ${Date.now() - startTime}ms\n`);
  }
}

// Interactive mode
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('V2 Fact-Check Endpoint Test Tool');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Enter X post URLs to test (or "quit" to exit)\n');

function askForUrl() {
  rl.question('Enter X post URL: ', async (url) => {
    if (url.toLowerCase() === 'quit') {
      console.log('\n👋 Goodbye!\n');
      rl.close();
      process.exit(0);
    }

    if (!url || (!url.includes('twitter.com') && !url.includes('x.com'))) {
      console.log('⚠️  Please enter a valid X/Twitter URL\n');
      askForUrl();
      return;
    }

    await testFactCheck(url.trim());
    askForUrl();
  });
}

askForUrl();
