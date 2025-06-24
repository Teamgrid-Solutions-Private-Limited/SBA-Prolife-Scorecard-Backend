/**
 * Cache configuration for Quorum API data
 */
module.exports = {
    // Cache TTL in milliseconds
    CACHE_TTL: {
        DEFAULT: 4 * 60 * 60 * 1000, // 4 hours
        SENATOR: 6 * 60 * 60 * 1000, // 6 hours
        REPRESENTATIVE: 6 * 60 * 60 * 1000, // 6 hours 
        STATE: 24 * 60 * 60 * 1000, // 24 hours (states rarely change)
        DISTRICT: 24 * 60 * 60 * 1000, // 24 hours (districts rarely change)
        BILLS: 2 * 60 * 60 * 1000 // 2 hours (bills may change more often)
    },
    
    // API request timeouts in milliseconds
    TIMEOUTS: {
        API_REQUEST: 30000, // 30 seconds for API requests (increased from 10 seconds)
        SERVER_RESPONSE: 45000 // 45 seconds before responding to client (increased from 15 seconds)
    },
    
    // Batch sizes for processing
    BATCH_SIZES: {
        DATABASE_OPERATIONS: 50, // Number of documents to update in a single batch
        BILL_UPDATES: 5, // Number of bills to process in parallel
        VOTE_UPDATES: 3 // Number of vote scores to update in parallel
    },
    
    // Circuit breaker configuration
    CIRCUIT_BREAKER: {
        FAILURE_THRESHOLD: 3, // Number of failures before opening circuit
        RESET_TIMEOUT: 30000, // 30 seconds timeout before attempting half-open state
        SUCCESS_THRESHOLD: 2 // Number of successful requests needed to close circuit
    },
    
    // Request queue configuration
    CONCURRENT_REQUESTS: 5, // Maximum number of concurrent requests to Quorum API
    
    // Pagination controls
    MAX_PARALLEL_PAGES: 3, // Maximum number of parallel page requests
    
    // Retry configuration
    MAX_RETRIES: 2, // Maximum number of retries for failed requests
    RETRY_DELAY_BASE: 1000 // Base delay in ms between retries (increases exponentially)
}; 