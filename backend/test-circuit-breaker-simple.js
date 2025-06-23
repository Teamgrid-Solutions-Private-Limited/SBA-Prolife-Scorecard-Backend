require("dotenv").config();
const controller = require('./controllers/getQuorumDataController');
const { performance } = require('perf_hooks');

// Helper to log with timestamp
function logWithTime(message) {
  const time = new Date().toISOString().substring(11, 19);
  console.log(`[${time}] ${message}`);
}

async function testCircuitBreaker() {
  logWithTime('=== Circuit Breaker Test ===');
  
  // Get the original fetchFromApi function
  const originalFetchFromApi = controller.fetchFromApi;
  let failCount = 0;
  
  // Override with a function that will fail after the first call
  controller.fetchFromApi = async function(url, params, cacheKey) {
    if (failCount === 0) {
      logWithTime('First call - allowing success to populate cache');
      failCount++;
      return originalFetchFromApi.call(this, url, params, cacheKey);
    } else {
      failCount++;
      logWithTime(`Call #${failCount} - simulating failure`);
      throw new Error('Simulated API failure');
    }
  };
  
  try {
    // First call - should succeed and populate cache
    logWithTime('\nStep 1: First call (should succeed and populate cache)');
    const data1 = await controller.fetchData('senator');
    logWithTime(`✅ Success! Fetched ${data1.length} items`);
    
    // Second call - should fail but use cache
    logWithTime('\nStep 2: Second call (should fail but use cache)');
    try {
      const data2 = await controller.fetchData('senator');
      logWithTime(`✅ Success! Using cache, fetched ${data2.length} items`);
      
      // Check if the data is the same (from cache)
      const isFromCache = data1.length === data2.length;
      logWithTime(`Cache verification: ${isFromCache ? '✅ Same length (using cache)' : '❌ Different length (not using cache)'}`);
    } catch (error) {
      logWithTime(`❌ Error: ${error.message}`);
    }
    
    // Make enough calls to trigger circuit breaker
    logWithTime('\nStep 3: Making multiple calls to trigger circuit breaker');
    for (let i = 0; i < 3; i++) {
      try {
        await controller.fetchData('senator');
        logWithTime('Call succeeded (should be using cache)');
      } catch (error) {
        logWithTime(`Call failed: ${error.message}`);
      }
    }
    
    // Circuit should be open now, verify we can still get data
    logWithTime('\nStep 4: Circuit should be open, verify we can still get data');
    try {
      const dataAfterOpen = await controller.fetchData('senator');
      logWithTime(`✅ Success with open circuit! Fetched ${dataAfterOpen.length} items`);
      logWithTime('This demonstrates graceful degradation with cached data when the API is down');
    } catch (error) {
      logWithTime(`❌ Error with open circuit: ${error.message}`);
    }
  } finally {
    // Restore original function
    controller.fetchFromApi = originalFetchFromApi;
    logWithTime('\n=== Test Complete ===');
  }
}

// Run the test
testCircuitBreaker().catch(error => {
  console.error('Test failed:', error);
}); 