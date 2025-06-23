require("dotenv").config();
const axios = require("axios");
const { performance } = require('perf_hooks');

// Base URL for API requests
const BASE_URL = "http://localhost:4000";

// Test configuration
const config = {
  timeout: 30000, // 30 seconds timeout for requests
  endpoints: [
    { 
      name: "Senator Data", 
      method: "POST",
      url: "/fetch-quorum/store-data",
      data: { type: "senator" }
    },
    { 
      name: "Representative Data", 
      method: "POST",
      url: "/fetch-quorum/store-data",
      data: { type: "representative" }
    },
    { 
      name: "Bills Data", 
      method: "POST",
      url: "/fetch-quorum/store-data",
      data: { type: "bills" }
    }
  ],
  repeatCount: 2 // Run each test twice to verify caching
};

// Utility function to measure request time
async function measureRequest(endpoint, iteration) {
  const label = `${endpoint.name} (${iteration === 0 ? 'cold cache' : 'warm cache'})`;
  console.log(`\nTesting ${label}...`);
  
  const start = performance.now();
  
  try {
    const response = await axios({
      method: endpoint.method,
      url: `${BASE_URL}${endpoint.url}`,
      data: endpoint.data,
      timeout: config.timeout
    });
    
    const end = performance.now();
    const duration = Math.round(end - start);
    
    console.log(`✅ ${label}: ${duration}ms`);
    console.log(`Status: ${response.status}`);
    
    if (response.data) {
      if (Array.isArray(response.data.data)) {
        console.log(`Data items: ${response.data.data.length}`);
      }
      console.log(`Message: ${response.data.message}`);
    }
    
    return { endpoint: endpoint.name, iteration, duration, status: 'success' };
  } catch (error) {
    const end = performance.now();
    const duration = Math.round(end - start);
    
    console.log(`❌ ${label}: ${duration}ms - ${error.message}`);
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Error message: ${JSON.stringify(error.response.data)}`);
    }
    
    return { endpoint: endpoint.name, iteration, duration, status: 'error', error: error.message };
  }
}

// Main test function
async function runTests() {
  console.log("=== API Performance Verification Test ===");
  console.log(`Testing ${config.endpoints.length} endpoints with ${config.repeatCount} iterations each`);
  console.log("This will verify both functionality and caching performance");
  console.log("Make sure the server is running before starting this test");
  console.log("\nStarting tests in 3 seconds...");
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const results = [];
  
  // Test each endpoint multiple times
  for (const endpoint of config.endpoints) {
    for (let i = 0; i < config.repeatCount; i++) {
      const result = await measureRequest(endpoint, i);
      results.push(result);
      
      // Small delay between requests
      if (i < config.repeatCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  
  // Print summary
  console.log("\n=== Test Results Summary ===");
  console.table(results.map(r => ({
    Endpoint: r.endpoint,
    Iteration: r.iteration === 0 ? 'First (cold)' : 'Second (warm)',
    Duration: `${r.duration}ms`,
    Status: r.status
  })));
  
  // Calculate improvements
  console.log("\n=== Performance Improvement Analysis ===");
  
  const endpointNames = [...new Set(results.map(r => r.endpoint))];
  
  for (const name of endpointNames) {
    const endpointResults = results.filter(r => r.endpoint === name && r.status === 'success');
    
    if (endpointResults.length >= 2) {
      const firstRun = endpointResults.find(r => r.iteration === 0);
      const secondRun = endpointResults.find(r => r.iteration === 1);
      
      if (firstRun && secondRun) {
        const improvement = (firstRun.duration - secondRun.duration) / firstRun.duration * 100;
        console.log(`${name}:`);
        console.log(`  First request: ${firstRun.duration}ms`);
        console.log(`  Second request: ${secondRun.duration}ms`);
        console.log(`  Improvement: ${improvement.toFixed(2)}%`);
        
        if (improvement > 90) {
          console.log(`  ✅ Excellent caching performance`);
        } else if (improvement > 50) {
          console.log(`  ✅ Good caching performance`);
        } else if (improvement > 20) {
          console.log(`  ⚠️ Moderate caching performance`);
        } else {
          console.log(`  ❌ Poor caching performance`);
        }
      }
    }
  }
  
  console.log("\n=== Test Complete ===");
}

// Check if server is running first
async function checkServer() {
  try {
    await axios.get(`${BASE_URL}`, { timeout: 5000 });
    return true;
  } catch (error) {
    return false;
  }
}

// Run the tests
checkServer()
  .then(isRunning => {
    if (isRunning) {
      runTests().catch(console.error);
    } else {
      console.error("❌ Server is not running! Please start the server first with 'npm start' or 'node server.js'");
    }
  })
  .catch(console.error); 