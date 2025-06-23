require("dotenv").config();
const axios = require("axios");
const controller = require("./controllers/getQuorumDataController");
const { performance } = require('perf_hooks');

/**
 * Test script for the circuit breaker pattern
 * This script simulates API failures and tests the circuit breaker behavior
 */

console.log("=== Circuit Breaker Pattern Test ===\n");

// Measure execution time
const startTime = performance.now();

// Mock the API client to simulate failures
const originalFetchFromApi = controller.fetchFromApi;
let failureCount = 0;

// Replace the fetchFromApi with a mock that fails
controller.fetchFromApi = async function(url, params, cacheKey) {
  console.log(`API request attempt #${failureCount + 1} to ${url}`);
  
  // First, simulate a successful request to populate cache
  if (failureCount === 0) {
    console.log("First request succeeds to populate cache");
    const result = await originalFetchFromApi.call(this, url, params, cacheKey);
    failureCount++;
    return result;
  }
  
  // Then simulate failures to trigger circuit breaker
  if (failureCount < 5) {
    failureCount++;
    console.log(`Simulating API failure #${failureCount - 1}`);
    throw new Error("Simulated API failure");
  }
  
  // After 5 failures, succeed again to test recovery
  console.log("Simulating API recovery");
  return await originalFetchFromApi.call(this, url, params, cacheKey);
};

// Test function
async function testCircuitBreaker() {
  try {
    // Initial request - should succeed
    console.log("\nStep 1: Initial successful request (populate cache)");
    const initialData = await controller.fetchData("senator");
    console.log(`✅ Initial request successful, fetched ${initialData.length} items`);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Multiple requests to trigger circuit breaker
    console.log("\nStep 2: Multiple requests to trigger circuit breaker");
    for (let i = 0; i < 3; i++) {
      try {
        await controller.fetchData("senator");
        console.log("❌ Request should have failed but succeeded");
      } catch (error) {
        console.log(`✅ Expected failure: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Circuit should be OPEN now
    console.log("\nStep 3: Circuit should be OPEN, using cache");
    const cachedData = await controller.fetchData("senator");
    console.log(`✅ Circuit open, using cache with ${cachedData.length} items`);
    
    // Wait for circuit reset
    console.log("\nStep 4: Waiting for circuit reset (30s timeout)...");
    await new Promise(resolve => setTimeout(resolve, 32000));
    
    // Circuit should be HALF-OPEN now
    console.log("\nStep 5: Circuit should be HALF-OPEN, allowing test request");
    const recoveryData = await controller.fetchData("senator");
    console.log(`✅ Recovery request successful, fetched ${recoveryData.length} items`);
    
    // Circuit should transition back to CLOSED after success
    console.log("\nStep 6: Circuit should transition back to CLOSED");
    const finalData = await controller.fetchData("senator");
    console.log(`✅ Final request successful, fetched ${finalData.length} items`);
    
    // Restore original function
    controller.fetchFromApi = originalFetchFromApi;
    
    const endTime = performance.now();
    console.log(`\nTest completed in ${Math.round(endTime - startTime)}ms`);
    console.log("\n=== Circuit Breaker Test Completed ===");
  } catch (error) {
    console.error("Test failed:", error);
    // Restore original function
    controller.fetchFromApi = originalFetchFromApi;
  }
}

// Run the test
console.log("Starting circuit breaker test...");
console.log("Note: This test takes about 35 seconds to complete due to circuit timeout");

testCircuitBreaker(); 