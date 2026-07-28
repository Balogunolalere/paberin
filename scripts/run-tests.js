#!/usr/bin/env node
/**
 * Test Runner for Paberin LLM Chat Evaluation
 * 
 * This script provides a unified interface to run all evaluation tests.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const PROJECT_ROOT = path.join(__dirname, '..')

function runCommand(command, options = {}) {
  const { verbose = true } = options
  if (verbose) console.log(`\n> ${command}`)
  
  try {
    const result = execSync(command, { 
      cwd: PROJECT_ROOT,
      stdio: verbose ? 'inherit' : 'pipe'
    })
    
    if (verbose) console.log(result.toString())
    return { success: true, output: result.toString() }
  } catch (error) {
    return { success: false, error: error.message, output: error.stderr?.toString() || error.message }
  }
}

async function main() {
  console.log('='.repeat(70))
  console.log('Paberin LLM Chat - Unified Test Runner')
  console.log('='.repeat(70))
  
  // Check if node_modules exists
  const nodeModulesPath = path.join(PROJECT_ROOT, 'node_modules')
  if (!fs.existsSync(nodeModulesPath)) {
    console.error('❌ Error: node_modules not found. Please run "pnpm install" first.')
    process.exit(1)
  }
  
  console.log(`\n📁 Project Root: ${PROJECT_ROOT}`)
  console.log(`📦 Node modules: ${fs.existsSync(nodeModulesPath) ? '✅ Present' : '❌ Missing'}`)
  
  // Step 1: Run unit tests
  console.log('\n' + '='.repeat(70))
  console.log('STEP 1: Running Unit Tests')
  console.log('='.repeat(70))
  
  const unitTestResult = runCommand('pnpm test run tests/unit', { verbose: true })
  
  // Step 2: Run evaluation script
  console.log('\n' + '='.repeat(70))
  console.log('STEP 2: Running LLM Evaluation Script')
  console.log('='.repeat(70))
  
  const evalResult = runCommand('node scripts/evaluate-chat.js', { verbose: true })
  
  // Step 3: Generate summary
  console.log('\n' + '='.repeat(70))
  console.log('TEST SUMMARY')
  console.log('='.repeat(70))
  
  console.log(`Unit Tests: ${unitTestResult.success ? '✅ PASSED' : '❌ FAILED'}`)
  console.log(`LLM Evaluation: ${evalResult.success ? '✅ COMPLETED' : '❌ FAILED'}`)
  
  const allPassed = unitTestResult.success && evalResult.success
  process.exit(allPassed ? 0 : 1)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})