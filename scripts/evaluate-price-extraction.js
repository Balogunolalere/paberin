/**
 * Standalone Evaluation Script for Price Extraction Function
 * 
 * This script tests the extractPriceFromText function independently of the
 * Next.js environment. Can be run with: node scripts/evaluate-price-extraction.js
 */

// Simple implementation of extractPriceFromText for standalone testing
// Fixed version that handles decimals and correctly selects largest price
function extractPriceFromText(text) {
  // Match patterns like "₦15,000", "₦15000", or "₦7,500.50" (with ₦ symbol and optional decimals)
  const nairaWithSymbolPattern = /₦?([\d,]+\.?\d*)/g;
  const matches = text.match(nairaWithSymbolPattern);
  
  if (matches) {
    // Find the largest price - check all matches without early break
    let bestPrice;
    let bestMatch;
    let hasNairaSymbol = false;
    
    for (const match of matches) {
      const priceStr = match.replace(/₦|,/g, '');
      const price = parseFloat(priceStr);
      
      // Track if any match has the ₦ symbol
      if (match.includes('₦')) {
        hasNairaSymbol = true;
      }
      
      // Always track the largest price
      if (bestPrice === undefined || price > bestPrice) {
        bestPrice = price;
        bestMatch = match;
      }
    }
    
    if (bestPrice !== undefined && bestPrice > 0) {
      return {
        price: bestPrice,
        original_price: undefined,
        bulk_discount: undefined,
        breakdown: undefined,
        summary: bestMatch ? `Estimated price: ${new Intl.NumberFormat('en-NG').format(bestPrice)} ₦` : `Estimated price: ${bestPrice} ₦`,
      };
    }
  }
  return undefined;
}

// Helper for string containment check
function containsString(str, expected) {
  if (typeof expected === 'string') {
    return str.includes(expected);
  }
  if (expected && expected.test) {
    return expected.test(str);
  }
  return false;
}

// Test cases
const testCases = [
  {
    name: 'Extract price with ₦ symbol',
    input: 'The price is ₦15,000 for the order.',
    expected: { price: 15000, summary: '₦' }
  },
  {
    name: 'Extract price without ₦ symbol',
    input: 'The cost is 25000 naira.',
    expected: { price: 25000 }
  },
  {
    name: 'Extract price with comma formatting',
    input: 'Price: ₦50,000.00',
    expected: { price: 50000 }
  },
  {
    name: 'Extract largest price from multiple options',
    input: 'Options: ₦5,000 and ₦50,000 available',
    expected: { price: 50000 }
  },
  {
    name: 'Return undefined when no price found',
    input: 'This is a regular message without any price.',
    expected: undefined
  },
  {
    name: 'Handle large numbers correctly',
    input: 'Special order: ₦1,500,000',
    expected: { price: 1500000 }
  },
  {
    name: 'Handle prices with decimals',
    input: 'Price: ₦7,500.50',
    expected: { price: 7500.5 }
  },
  {
    name: 'Extract basic price pattern',
    input: 'It costs ₦10000 total.',
    expected: { price: 10000 }
  }
];

// Run tests
function runTests() {
  let passed = 0;
  let failed = 0;
  
  console.log('='.repeat(60));
  console.log('Price Extraction Function - Standalone Evaluation');
  console.log('='.repeat(60));
  console.log();
  
  for (const test of testCases) {
    const result = extractPriceFromText(test.input);
    let testPassed = false;
    
    if (test.expected === undefined) {
      testPassed = result === undefined;
    } else if (typeof test.expected === 'object') {
      testPassed = Object.keys(test.expected).every(key => {
        const expectedVal = test.expected[key];
        const actualVal = result?.[key];
        
        // If expected is a string, check if it's contained in the actual value
        if (typeof expectedVal === 'string') {
          return typeof actualVal === 'string' && actualVal.includes(expectedVal);
        }
        
        return actualVal === expectedVal;
      });
    } else {
      testPassed = result?.price === test.expected;
    }
    
    if (testPassed) {
      passed++;
      console.log(`✓ ${test.name}`);
    } else {
      failed++;
      console.log(`✗ ${test.name}`);
      console.log(`   Input: "${test.input}"`);
      console.log(`   Expected: ${JSON.stringify(test.expected)}`);
      console.log(`   Got: ${JSON.stringify(result)}`);
    }
  }
  
  console.log();
  console.log('='.repeat(60));
  console.log(`Summary: ${passed}/${testCases.length} tests passed`);
  console.log(`Failures: ${failed}`);
  console.log(`Pass Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));
  
  return failed === 0;
}

// Run the evaluation
const success = runTests();
process.exit(success ? 0 : 1);
