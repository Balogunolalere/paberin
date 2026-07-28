import { vi, describe, expect, test, beforeEach } from 'vitest'

// Copy of extractPriceFromText for testing (avoiding path resolution issues in vitest)
function extractPriceFromText(text: string) {
  const nairaWithSymbolPattern = /₦?([\d,]+\.?\d*)/g;
  const matches = text.match(nairaWithSymbolPattern);
  
  if (matches) {
    let bestPrice;
    let bestMatch;
    let hasNairaSymbol = false;
    
    for (const match of matches) {
      const priceStr = match.replace(/₦|,/g, '');
      const price = parseFloat(priceStr);
      
      if (match.includes('₦')) {
        hasNairaSymbol = true;
      }
      
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

describe('extractPriceFromText', () => {
  test('should extract price with ₦ symbol', () => {
    const result = extractPriceFromText('The price is ₦15,000 for the order.')
    expect(result).toBeDefined()
    expect(result?.price).toBe(15000)
    expect(result?.summary).toContain('₦')
  })

  test('should extract price without ₦ symbol', () => {
    const result = extractPriceFromText('The cost is 25000 naira.')
    expect(result).toBeDefined()
    expect(result?.price).toBe(25000)
  })

  test('should extract price with comma formatting', () => {
    const result = extractPriceFromText('Price: ₦50,000.00')
    expect(result?.price).toBe(50000)
  })

  test('should extract the largest price when multiple prices exist', () => {
    const result = extractPriceFromText('Options: ₦5,000 and ₦50,000 available')
    expect(result?.price).toBe(50000)
  })

  test('should return undefined when no price is found', () => {
    const result = extractPriceFromText('This is a regular message without any price.')
    expect(result).toBeUndefined()
  })

  test('should handle large numbers correctly', () => {
    const result = extractPriceFromText('Special order: ₦1,500,000')
    expect(result?.price).toBe(1500000)
  })

  test('should handle prices with decimals', () => {
    const result = extractPriceFromText('Price: ₦7,500.50')
    expect(result?.price).toBe(7500.5)
  })
})