require("dotenv").config();
const controller = require("./controllers/getQuorumDataController");

/**
 * Test script for memory optimization feature
 * This script measures memory footprint before and after optimization
 */

console.log("=== Memory Optimization Test ===\n");

// Helper to get memory usage in MB
function getMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  return {
    rss: Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024 * 100) / 100,
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100,
    external: Math.round(memoryUsage.external / 1024 / 1024 * 100) / 100
  };
}

// Helper to generate sample data
function generateLargeData(count = 1000) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      id: i,
      firstname: `FirstName${i}`,
      middlename: `MiddleName${i}`,
      lastname: `LastName${i}`,
      title: "US Senator",
      most_recent_party: 1,
      most_recent_state: "/api/state/1/",
      high_quality_image_url: `https://example.com/image${i}.jpg`,
      image_url: `https://example.com/small-image${i}.jpg`,
      biography: "A very long biography that takes up a lot of space. ".repeat(50),
      contact_form: `https://example.com/contact/${i}`,
      date_of_birth: "1970-01-01",
      gender: "M",
      leadership_title: "None",
      office: "123 Senate Building",
      party_title: "Senator",
      phone: "123-456-7890",
      twitter_handle: `@senator${i}`,
      youtube_url: `https://youtube.com/senator${i}`,
      facebook_url: `https://facebook.com/senator${i}`,
      instagram_url: `https://instagram.com/senator${i}`,
      campaign_website: `https://vote${i}.com`,
      extra_large_data: "This is unnecessary data. ".repeat(100)
    });
  }
  return items;
}

// Test function
async function testMemoryOptimization() {
  try {
    // Garbage collect if possible
    if (global.gc) {
      global.gc();
    } else {
      console.log("⚠️ Garbage collection unavailable. Run with --expose-gc flag for better results.");
    }
    
    // Initial memory usage
    const initialMemory = getMemoryUsage();
    console.log("Initial memory usage:", initialMemory);
    
    // Generate large sample data
    console.log("\nGenerating sample data...");
    const sampleData = generateLargeData(1000);
    console.log(`Generated ${sampleData.length} sample records`);
    
    // Memory usage after generating data
    const afterGenerationMemory = getMemoryUsage();
    console.log("Memory after generation:", afterGenerationMemory);
    console.log(`Increase: ${(afterGenerationMemory.heapUsed - initialMemory.heapUsed).toFixed(2)} MB`);
    
    // Apply memory optimization (trim data)
    console.log("\nApplying memory optimization...");
    const optimizedData = controller.trimDataForMemory(sampleData, "senator");
    console.log(`Optimized ${optimizedData.length} records`);
    
    // Memory usage after optimization
    const afterOptimizationMemory = getMemoryUsage();
    console.log("Memory after optimization:", afterOptimizationMemory);
    
    // Calculate memory savings
    const originalSize = JSON.stringify(sampleData).length / 1024 / 1024;
    const optimizedSize = JSON.stringify(optimizedData).length / 1024 / 1024;
    const savings = 100 - (optimizedSize / originalSize * 100);
    
    console.log(`\nOriginal data size: ${originalSize.toFixed(2)} MB`);
    console.log(`Optimized data size: ${optimizedSize.toFixed(2)} MB`);
    console.log(`Memory reduction: ${savings.toFixed(2)}%`);
    
    // Check retained fields
    console.log("\nChecking retained fields...");
    const sampleRecord = optimizedData[0];
    console.log("Sample optimized record:");
    console.log(sampleRecord);
    
    // Check fields that should be removed
    console.log("\nChecking fields that should be removed...");
    const shouldBeRemoved = [
      'biography', 'contact_form', 'date_of_birth', 'gender', 
      'leadership_title', 'office', 'party_title', 'phone',
      'twitter_handle', 'youtube_url', 'facebook_url', 
      'instagram_url', 'campaign_website', 'extra_large_data'
    ];
    
    const removedFields = shouldBeRemoved.filter(field => sampleRecord[field] === undefined);
    console.log(`${removedFields.length} of ${shouldBeRemoved.length} unnecessary fields removed`);
    
    if (removedFields.length === shouldBeRemoved.length) {
      console.log("✅ All unnecessary fields removed successfully");
    } else {
      console.log("❌ Some fields were not removed:");
      shouldBeRemoved.forEach(field => {
        if (sampleRecord[field] !== undefined) {
          console.log(`  - ${field} still present`);
        }
      });
    }
    
    console.log("\n=== Memory Optimization Test Completed ===");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

// Run the test
testMemoryOptimization(); 