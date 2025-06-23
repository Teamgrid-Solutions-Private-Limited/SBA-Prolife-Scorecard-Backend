require("dotenv").config();
const axios = require("axios");
const controller = require("./controllers/getQuorumDataController");

// Simple timer utility
const timer = {
  start: function() {
    this.startTime = Date.now();
    return this;
  },
  end: function(label) {
    const duration = Date.now() - this.startTime;
    console.log(`${label}: ${duration}ms`);
    return duration;
  }
};

// Test the fetchData performance with cache warm-up
async function testFetchData() {
  console.log("\n=== Testing API Fetch Performance ===\n");
  
  // First run to populate cache
  console.log("First run (cache cold):");
  await timer.start().end("Starting test");
  
  const t1 = timer.start();
  const senatorData = await controller.fetchData("senator");
  const time1 = t1.end("Senator data fetch (cold cache)");
  console.log(`Fetched ${senatorData.length} senators`);
  
  // Second run to test cache
  console.log("\nSecond run (cache warm):");
  const t2 = timer.start();
  const cachedSenatorData = await controller.fetchData("senator");
  const time2 = t2.end("Senator data fetch (warm cache)");
  console.log(`Fetched ${cachedSenatorData.length} senators`);
  
  console.log(`\nCache performance improvement: ${Math.round((time1 - time2) / time1 * 100)}%`);
  
  // Test parallel API call
  console.log("\nTesting parallel API calls:");
  const t3 = timer.start();
  const [senators, representatives] = await Promise.all([
    controller.fetchData("senator"),
    controller.fetchData("representative")
  ]);
  t3.end("Parallel data fetch");
  console.log(`Fetched ${senators.length} senators and ${representatives.length} representatives`);
}

// Test the full request cycle
async function testSaveData() {
  console.log("\n=== Testing Full Request Cycle ===\n");
  
  // Test the timeout mechanism (mock a slow request)
  const originalFetchData = controller.fetchData;
  controller.fetchData = async function(type) {
    console.log("Simulating slow API (10s delay)...");
    await new Promise(resolve => setTimeout(resolve, 10000));
    return originalFetchData.call(this, type);
  };
  
  try {
    const response = await axios.post("http://localhost:4000/fetch-quorum/store-data", {
      type: "senator"
    });
    console.log("Response:", response.data);
  } catch (error) {
    console.log("Expected timeout response:", error.response?.data || error.message);
    // Reset the mock
    controller.fetchData = originalFetchData;
    
    console.log("\nTesting with normal speed:");
    try {
      const response = await axios.post("http://localhost:4000/fetch-quorum/store-data", {
        type: "representative"
      });
      console.log("Response:", response.data);
    } catch (error) {
      console.error("Error:", error.message);
    }
  }
}

// Execute tests
async function runTests() {
  try {
    // Test fetch data performance
    await testFetchData();
    
    // Uncomment to test the full request cycle (requires server to be running)
    // await testSaveData();
    
    console.log("\n=== Testing Complete ===");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runTests(); 