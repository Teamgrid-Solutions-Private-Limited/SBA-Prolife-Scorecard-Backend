module.exports = {
    CACHE_TTL: {
        DEFAULT: 4 * 60 * 60 * 1000,
        SENATOR: 6 * 60 * 60 * 1000,
        REPRESENTATIVE: 6 * 60 * 60 * 1000,
        STATE: 24 * 60 * 60 * 1000,
        DISTRICT: 24 * 60 * 60 * 1000,
        BILLS: 2 * 60 * 60 * 1000
    },
    
    TIMEOUTS: {
        API_REQUEST: 40000, 
        SERVER_RESPONSE: 45000
    },
    
    BATCH_SIZES: {
        DATABASE_OPERATIONS: 50, 
        BILL_UPDATES: 5, 
        VOTE_UPDATES: 3 
    },
    
    CIRCUIT_BREAKER: {
        FAILURE_THRESHOLD: 3,
        RESET_TIMEOUT: 40000,
        SUCCESS_THRESHOLD: 2
    },
    
    CONCURRENT_REQUESTS: 5, 
    
    MAX_PARALLEL_PAGES: 3, 
    
    MAX_RETRIES: 2, 
    RETRY_DELAY_BASE: 1000 
}; 