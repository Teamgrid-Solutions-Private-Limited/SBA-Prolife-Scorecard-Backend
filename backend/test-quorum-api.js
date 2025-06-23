require("dotenv").config();
const axios = require("axios");
const controller = require("./controllers/getQuorumDataController");
const { performance } = require('perf_hooks');

// Performance test utility
class PerformanceTest {
  constructor() {
    this.results = [];
  }

  async measure(name, fn) {
    const start = performance.now();
    try {
      const result = await fn();
      const end = performance.now();
      const duration = end - start;
      
      this.results.push({
        name,
        duration,
        status: 'success',
        data: result
      });
      
      console.log(`✅ ${name}: ${Math.round(duration)}ms`);
      return result;
    } catch (error) {
      const end = performance.now();
      const duration = end - start;
      
      this.results.push({
        name,
        duration,
        status: 'error',
        error: error.message
      });
      
      console.log(`❌ ${name}: ${Math.round(duration)}ms - ${error.message}`);
      throw error;
    }
  }

  summary() {
    console.log("\n=== Performance Test Summary ===");
    console.table(this.results.map(r => ({
      Test: r.name,
      Duration: `${Math.round(r.duration)}ms`,
      Status: r.status,
      Details: r.status === 'success' ? 
        (Array.isArray(r.data) ? `${r.data.length} items` : (typeof r.data === 'object' ? 'Object' : r.data)) : 
        r.error
    })));
  }
}

// Test suites
const tests = {
  // Test cache performance
  cache: async function() {
    const perf = new PerformanceTest();
    console.log("\n=== Testing Cache Performance ===\n");
    
    // First run (cold cache)
    const coldData = await perf.measure('Fetch senators (cold cache)', async () => {
      return controller.fetchData("senator");
    });
    
    // Second run (warm cache)
    const warmData = await perf.measure('Fetch senators (warm cache)', async () => {
      return controller.fetchData("senator");
    });
    
    // Calculate improvement
    const coldTime = perf.results[0].duration;
    const warmTime = perf.results[1].duration;
    const improvement = (coldTime - warmTime) / coldTime * 100;
    
    console.log(`\nCache performance improvement: ${Math.round(improvement)}%`);
    console.log(`Items fetched: ${coldData.length}`);
    
    return perf.results;
  },
  
  // Test parallel processing
  parallel: async function() {
    const perf = new PerformanceTest();
    console.log("\n=== Testing Parallel Processing ===\n");
    
    // Sequential fetching
    await perf.measure('Sequential fetch', async () => {
      const senators = await controller.fetchData("senator");
      const representatives = await controller.fetchData("representative");
      return { senators: senators.length, representatives: representatives.length };
    });
    
    // Parallel fetching
    await perf.measure('Parallel fetch', async () => {
      const [senators, representatives] = await Promise.all([
        controller.fetchData("senator"),
        controller.fetchData("representative")
      ]);
      return { senators: senators.length, representatives: representatives.length };
    });
    
    // Calculate improvement
    const seqTime = perf.results[0].duration;
    const parTime = perf.results[1].duration;
    const improvement = (seqTime - parTime) / seqTime * 100;
    
    console.log(`\nParallel processing improvement: ${Math.round(improvement)}%`);
    
    return perf.results;
  },
  
  // Test error handling and fallback
  error: async function() {
    const perf = new PerformanceTest();
    console.log("\n=== Testing Error Handling ===\n");
    
    // Make a normal request to populate cache
    await perf.measure('Initial data fetch', async () => {
      return controller.fetchData("senator");
    });
    
    // Mock a failure and test fallback
    const originalFetch = controller.fetchFromApi;
    controller.fetchFromApi = async () => {
      throw new Error("Simulated API failure");
    };
    
    try {
      await perf.measure('Fetch with failure (should use cache fallback)', async () => {
        return controller.fetchData("senator");
      });
    } finally {
      // Restore original function
      controller.fetchFromApi = originalFetch;
    }
    
    return perf.results;
  },
  
  // Test live endpoint performance (requires server running)
  endpoint: async function() {
    const perf = new PerformanceTest();
    console.log("\n=== Testing API Endpoint Performance ===\n");
    
    try {
      // Test the real endpoint
      await perf.measure('API endpoint call', async () => {
        const response = await axios.post("http://localhost:4000/fetch-quorum/store-data", {
          type: "representative"
        }, { timeout: 20000 });
        return response.data;
      });
    } catch (error) {
      console.log("Endpoint test requires server to be running. Skipping...");
    }
    
    return perf.results;
  },
  
  // Test timeout behavior
  timeout: async function() {
    const perf = new PerformanceTest();
    console.log("\n=== Testing Timeout Handling ===\n");
    
    // Backup original function
    const originalFetchData = controller.fetchData;
    
    // Override with slow version
    controller.fetchData = async function(type) {
      console.log("Simulating slow API (16s delay to trigger timeout)...");
      await new Promise(resolve => setTimeout(resolve, 16000));
      return []; // Return empty array
    };
    
    try {
      await perf.measure('API call with timeout', async () => {
        try {
          const response = await axios.post("http://localhost:4000/fetch-quorum/store-data", {
            type: "senator"
          }, { timeout: 20000 });
          return response.data;
        } catch (error) {
          // Expected timeout error
          if (error.response?.status === 408) {
            return { timeout: true, message: error.response.data.message };
          }
          throw error;
        }
      });
    } catch (error) {
      console.log("Timeout test requires server to be running. Skipping...");
    } finally {
      // Restore original function
      controller.fetchData = originalFetchData;
    }
    
    return perf.results;
  }
};

// Main function to run tests
async function runTests() {
  const testName = process.argv[2];
  
  if (!testName || testName === 'help') {
    console.log(`
Usage: node test-quorum-api.js [test-name]

Available tests:
  all         - Run all tests
  cache       - Test cache performance
  parallel    - Test parallel processing
  error       - Test error handling
  endpoint    - Test API endpoint (requires server running)
  timeout     - Test timeout behavior (requires server running)
  help        - Show this help message
    `);
    return;
  }
  
  const selectedTests = testName === 'all' 
    ? Object.keys(tests)
    : [testName];
  
  if (!selectedTests.every(t => tests[t])) {
    console.log(`Unknown test: ${testName}. Available tests: ${Object.keys(tests).join(', ')}`);
    return;
  }
  
  const allResults = [];
  
  for (const test of selectedTests) {
    if (tests[test]) {
      try {
        console.log(`\nRunning test: ${test}`);
        const results = await tests[test]();
        allResults.push(...results);
      } catch (error) {
        console.error(`Error running test "${test}":`, error.message);
      }
    }
  }
  
  // Print summary of all tests
  console.log("\n=== Overall Performance Test Summary ===");
  console.table(allResults.map(r => ({
    Test: r.name,
    Duration: `${Math.round(r.duration)}ms`,
    Status: r.status
  })));
}

// Run the tests
runTests().catch(error => {
  console.error("Test runner error:", error);
}); 