require("dotenv").config();
const controller = require('./controllers/getQuorumDataController');
const { performance } = require('perf_hooks');

async function testCache() {
  console.log('=== Simple Cache Test ===');
  
  // First call (cold cache)
  console.log('\nFirst call (cold cache):');
  const startFirst = performance.now();
  const data1 = await controller.fetchData('senator');
  const endFirst = performance.now();
  const firstDuration = Math.round(endFirst - startFirst);
  console.log(`Duration: ${firstDuration}ms`);
  console.log(`Fetched ${data1.length} items`);
  
  // Second call (warm cache)
  console.log('\nSecond call (warm cache):');
  const startSecond = performance.now();
  const data2 = await controller.fetchData('senator');
  const endSecond = performance.now();
  const secondDuration = Math.round(endSecond - startSecond);
  console.log(`Duration: ${secondDuration}ms`);
  console.log(`Fetched ${data2.length} items`);
  
  // Check that data is consistent
  const isSameLength = data1.length === data2.length;
  console.log('\nCache verification:');
  console.log(`Data consistency: ${isSameLength ? '✅ Same length' : '❌ Different length'}`);
  
  // Calculate improvement
  if (firstDuration > 0 && secondDuration >= 0) {
    const improvement = ((firstDuration - secondDuration) / firstDuration) * 100;
    console.log(`Performance improvement: ${improvement.toFixed(2)}%`);
    
    if (improvement > 90) {
      console.log(`✅ Excellent caching performance!`);
    } else if (improvement > 50) {
      console.log(`✅ Good caching performance`);
    } else if (improvement > 20) {
      console.log(`⚠️ Moderate caching performance`);
    } else {
      console.log(`❌ Poor caching performance`);
    }
  }
  
  console.log('\n=== Test Complete ===');
}

// Also test memory optimization
async function testMemoryOptimization() {
  console.log('\n=== Memory Optimization Test ===');
  
  // Generate test data
  console.log('Generating sample data...');
  const sampleData = [];
  for (let i = 0; i < 100; i++) {
    sampleData.push({
      id: i,
      firstname: `Test${i}`,
      lastname: `User${i}`,
      title: "US Senator",
      most_recent_party: 1,
      most_recent_state: "/api/state/1/",
      high_quality_image_url: "https://example.com/image.jpg",
      biography: "Very long biography text...",
      extra_data: "This should be removed in optimization",
      more_extra: "Another field to be removed"
    });
  }
  
  // Run optimization
  console.log('Applying memory optimization...');
  const optimizedData = controller.trimDataForMemory(sampleData, "senator");
  
  // Check result
  const originalSize = JSON.stringify(sampleData).length;
  const optimizedSize = JSON.stringify(optimizedData).length;
  const reduction = ((originalSize - optimizedSize) / originalSize) * 100;
  
  console.log(`Original size: ${Math.round(originalSize / 1024)} KB`);
  console.log(`Optimized size: ${Math.round(optimizedSize / 1024)} KB`);
  console.log(`Size reduction: ${reduction.toFixed(2)}%`);
  
  // Verify all required fields are present
  const firstItem = optimizedData[0];
  const requiredFields = ['id', 'firstname', 'lastname', 'title', 'most_recent_party', 'most_recent_state'];
  const removedFields = ['biography', 'extra_data', 'more_extra'];
  
  let allRequiredPresent = true;
  for (const field of requiredFields) {
    if (firstItem[field] === undefined) {
      console.log(`❌ Required field missing: ${field}`);
      allRequiredPresent = false;
    }
  }
  
  let allExtraRemoved = true;
  for (const field of removedFields) {
    if (firstItem[field] !== undefined) {
      console.log(`❌ Extra field not removed: ${field}`);
      allExtraRemoved = false;
    }
  }
  
  if (allRequiredPresent && allExtraRemoved) {
    console.log('✅ Memory optimization working correctly!');
  }
}

async function runAllTests() {
  try {
    await testCache();
    await testMemoryOptimization();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runAllTests(); 