require("dotenv").config();
const axios = require("axios");
const cacheConfig = require("../config/cache-config");

const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const Bill = require("../models/voteSchema");
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");

// Circuit breaker implementation
class CircuitBreaker {
  constructor(host) {
    this.host = host;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF-OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.failureThreshold = 3;
    this.resetTimeout = 30000; // 30 seconds
    this.successThreshold = 2;
  }

  success() {
    this.failureCount = 0;
    if (this.state === 'HALF-OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.successCount = 0;
        this.state = 'CLOSED';
        console.log(`Circuit to ${this.host} is now CLOSED`);
      }
    }
  }

  failure() {
    this.lastFailureTime = Date.now();
    this.failureCount++;
    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.log(`Circuit to ${this.host} is now OPEN`);
    }
  }

  canRequest() {
    if (this.state === 'CLOSED') {
      return true;
    }
    
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF-OPEN';
        this.successCount = 0;
        console.log(`Circuit to ${this.host} is now HALF-OPEN`);
        return true;
      }
      return false;
    }
    
    return this.state === 'HALF-OPEN';
  }
}

// Request queue for managing concurrent requests
class RequestQueue {
  constructor(concurrency = 3) {
    this.queue = [];
    this.running = 0;
    this.concurrency = concurrency;
  }

  add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const { task, resolve, reject } = this.queue.shift();
    this.running++;

    Promise.resolve(task())
      .then(result => {
        resolve(result);
        this.running--;
        this.process();
      })
      .catch(err => {
        reject(err);
        this.running--;
        this.process();
      });
  }
}

// Create a throttled axios instance with timeout
const apiClient = axios.create({
    timeout: cacheConfig.TIMEOUTS.API_REQUEST
});

// Add a global request interceptor for retries
apiClient.interceptors.response.use(null, async (error) => {
  const config = error.config;
  
  // Only retry GET requests
  if (!config || !config.method || config.method.toLowerCase() !== 'get') {
    return Promise.reject(error);
  }
  
  // Don't retry if we've already retried or max retries is 0
  config.__retryCount = config.__retryCount || 0;
  const maxRetries = 2;
  
  if (config.__retryCount >= maxRetries) {
    return Promise.reject(error);
  }
  
  // Retry with exponential backoff
  config.__retryCount += 1;
  const delay = config.__retryCount * 1000; // 1s, 2s
  
  console.log(`Retrying request to ${config.url} (attempt ${config.__retryCount})`);
  await new Promise(resolve => setTimeout(resolve, delay));
  
  return apiClient(config);
});

class QuorumDataController {
    constructor() {
        this.saveData = this.saveData.bind(this);
        this.saveBills = this.saveBills.bind(this);
        this.updateVoteScore = this.updateVoteScore.bind(this);

        // Add caches
        this._dataCache = {
            senator: { data: null, timestamp: 0 },
            representative: { data: null, timestamp: 0 },
            bills: { data: null, timestamp: 0 },
            state: { data: null, timestamp: 0 },
            district: { data: null, timestamp: 0 }
        };
        
        // Get TTL values from config
        this._CACHE_TTL = {
            senator: cacheConfig.CACHE_TTL.SENATOR,
            representative: cacheConfig.CACHE_TTL.REPRESENTATIVE,
            bills: cacheConfig.CACHE_TTL.BILLS,
            state: cacheConfig.CACHE_TTL.STATE,
            district: cacheConfig.CACHE_TTL.DISTRICT
        };
        
        // Initialize circuit breakers for different API endpoints
        this._circuitBreakers = {
            quorum: new CircuitBreaker('quorum.us'),
        };
        
        // Initialize request queue for limiting concurrent requests
        this._requestQueue = new RequestQueue(cacheConfig.CONCURRENT_REQUESTS || 5);
    }

    static API_URLS = {
        senator: process.env.QUORUM_SENATOR_API || "https://www.quorum.us/api/newperson/",
        representative: process.env.QUORUM_REP_API || "https://www.quorum.us/api/newperson/",
        bills: process.env.BILL_API_URL || "https://www.quorum.us/api/newbill/"
    };

    static MODELS = {
        senator: { model: Senator, idField: "senatorId" },
        representative: { model: Representative, idField: "repId" },
        bills: { model: Bill, idField: "quorumId" }
    };

    // Generic API Fetcher with caching, circuit breaker and queue
    async fetchFromApi(url, params, cacheKey) {
        // Check cache first
        if (cacheKey) {
            const cache = this._dataCache[cacheKey];
            const now = Date.now();
            const ttl = this._CACHE_TTL[cacheKey] || cacheConfig.CACHE_TTL.DEFAULT;
            if (cache?.data && (now - cache.timestamp < ttl)) {
                return cache.data;
            }
        }

        // Check circuit breaker state
        const circuitBreaker = this._circuitBreakers.quorum;
        if (!circuitBreaker.canRequest()) {
            console.log(`Circuit is OPEN for ${url}, using cache or empty result`);
            // Return cached data if available even if expired
            if (cacheKey && this._dataCache[cacheKey]?.data) {
                return this._dataCache[cacheKey].data;
            }
            return [];
        }

        // Queue the API request
        try {
            const fetchTask = () => apiClient.get(url, { params });
            const response = await this._requestQueue.add(fetchTask);
            
            // Success, update circuit breaker
            circuitBreaker.success();
            
            if (!response.data || !Array.isArray(response.data.objects)) return [];
            
            // Update cache
            if (cacheKey) {
                this._dataCache[cacheKey] = {
                    data: response.data.objects,
                    timestamp: Date.now()
                };
            }
            
            return response.data.objects;
        } catch (error) {
            // Failure, update circuit breaker
            circuitBreaker.failure();
            
            console.error(`API fetch error for ${url}:`, error.message);
            // Return cached data if available even if expired
            if (cacheKey && this._dataCache[cacheKey]?.data) {
                console.log(`Using expired cache for ${cacheKey}`);
                return this._dataCache[cacheKey].data;
            }
            return [];
        }
    }

    async fetchStateData() {
        const params = {
            api_key: process.env.QUORUM_API_KEY,
            username: process.env.QUORUM_USERNAME,
            limit: 400
        };
        
        const data = await this.fetchFromApi("https://www.quorum.us/api/state/", params, "state");
        return Object.fromEntries(data.map(state => [state.resource_uri, state.name]));
    }

    async fetchDistrictData() {
        const params = {
            api_key: process.env.QUORUM_API_KEY,
            username: process.env.QUORUM_USERNAME,
            limit: 1000
        };
        
        const data = await this.fetchFromApi("https://www.quorum.us/api/district/", params, "district");
        return Object.fromEntries(data.map(d => [d.resource_uri, d.name]));
    }

    async fetchData(type, additionalParams = {}) {
        if (!QuorumDataController.API_URLS[type]) throw new Error(`Invalid API type: ${type}`);

        // Check cache first
        const cache = this._dataCache[type];
        const now = Date.now();
        if (cache?.data && (now - cache.timestamp < (this._CACHE_TTL[type] || cacheConfig.CACHE_TTL.DEFAULT))) {
            return cache.data;
        }

        // Check circuit breaker state
        const circuitBreaker = this._circuitBreakers.quorum;
        if (!circuitBreaker.canRequest()) {
            console.log(`Circuit is OPEN for ${type} data, using cache or empty result`);
            // Return cached data if available even if expired
            if (cache?.data) {
                return cache.data;
            }
            return [];
        }

        const allData = [];
        const limit = { senator: 120, representative: 500, bills: 20 }[type] || 20;
        const maxRecords = type === "bills" ? 20 : 1000;

        try {
            const firstParams = {
                api_key: process.env.QUORUM_API_KEY,
                username: process.env.QUORUM_USERNAME,
                limit,
                offset: 0,
                ...additionalParams,
                ...(type === "senator" && { current: true })
            };

            // Queue the initial API request
            const fetchTask = () => apiClient.get(QuorumDataController.API_URLS[type], { params: firstParams });
            const response = await this._requestQueue.add(fetchTask);
            
            // Success, update circuit breaker
            circuitBreaker.success();
            
            if (!response.data?.objects?.length) return [];

            allData.push(...response.data.objects);

            if (response.data.meta?.next && type !== "bills") {
                // Only do parallel requests for senators and representatives
                const totalPages = Math.min(
                    Math.ceil(response.data.meta.total_count / limit),
                    Math.ceil(maxRecords / limit) - 1
                );
                
                // Limit parallel requests
                const maxParallelRequests = cacheConfig.MAX_PARALLEL_PAGES || 3;
                
                for (let page = 1; page <= totalPages; page += maxParallelRequests) {
                    const pagePromises = [];
                    
                    // Create a batch of page requests
                    for (let i = 0; i < maxParallelRequests && page + i <= totalPages; i++) {
                        const pageOffset = (page + i) * limit;
                        const pageParams = { ...firstParams, offset: pageOffset };
                        
                        // Queue each page request
                        const pageTask = () => apiClient.get(QuorumDataController.API_URLS[type], { params: pageParams })
                            .then(res => res.data?.objects || [])
                            .catch(err => {
                                console.error(`Page ${page + i} fetch error:`, err.message);
                                return [];
                            });
                            
                        pagePromises.push(this._requestQueue.add(pageTask));
                    }
                    
                    // Get results for this batch
                    const pageResults = await Promise.all(pagePromises);
                    pageResults.forEach(pageData => {
                        allData.push(...pageData);
                    });
                }
            }

            // Memory optimization: only keep needed data
            const trimmedData = this.trimDataForMemory(allData.slice(0, maxRecords), type);

            // Store in cache
            this._dataCache[type] = {
                data: trimmedData,
                timestamp: now
            };
            
            return trimmedData;
        } catch (error) {
            // Failure, update circuit breaker
            circuitBreaker.failure();
            
            console.error(`Failed to fetch ${type} data:`, error.message);
            
            // Return cached data if available even if expired
            if (cache?.data) {
                console.log(`Using expired cache for ${type}`);
                return cache.data;
            }
            
            return [];
        }
    }

    // Trim unnecessary data to reduce memory usage
    trimDataForMemory(data, type) {
        if (!data || !data.length) return data;
        
        // Define fields to keep for each type
        const keepFields = {
            senator: ['id', 'firstname', 'middlename', 'lastname', 'title', 'most_recent_party', 
                     'most_recent_state', 'high_quality_image_url', 'image_url'],
            representative: ['id', 'firstname', 'middlename', 'lastname', 'title', 'most_recent_party',
                           'most_recent_district', 'minor_person_types', 'high_quality_image_url', 'image_url'],
            bills: ['id', 'title', 'bill_type', 'introduced_date'],
            state: null, // keep all
            district: null // keep all
        };
        
        // If no specific fields to keep, return original data
        if (!keepFields[type]) return data;
        
        // Create trimmed copies with only necessary fields
        return data.map(item => {
            const trimmed = {};
            for (const field of keepFields[type]) {
                if (item[field] !== undefined) {
                    trimmed[field] = item[field];
                }
            }
            return trimmed;
        });
    }

    async filterData(type, data) {
        const partyMap = { 1: "democrat", 2: "republican", 3: "independent" };
        
        // Fetch state and district data in parallel
        const [stateMap, districtMap] = await Promise.all([
            this.fetchStateData(),
            this.fetchDistrictData()
        ]);

        const mappings = {
            senator: item => item.title === "US Senator" ? {
                senatorId: item.id,
                name: `Sen. ${item.firstname || ""} ${item.middlename || ""} ${item.lastname || ""}`.trim(),
                party: partyMap[item.most_recent_party] || "Unknown",
                photo: item.high_quality_image_url || item.image_url || null,
                state: stateMap[item.most_recent_state] || "Unknown"
            } : null,

            representative: item => (item.minor_person_types?.includes(2) && item.title === "US Representative") ? {
                repId: item.id,
                name: `Rep. ${item.firstname || ""} ${item.middlename || ""} ${item.lastname || ""}`.trim(),
                party: partyMap[item.most_recent_party] || "Unknown",
                photo: item.high_quality_image_url || item.image_url || null,
                district: districtMap[item.most_recent_district] || "Unknown"
            } : null,

            bills: item => ({
                quorumId: item.id,
                title: item.title || "Unknown",
                type: item.bill_type || "Unknown",
                date: item.introduced_date || "Unknown"
            })
        };

        return data.map(mappings[type]).filter(Boolean);
    }

    async saveData(req, res) {
        try {
            const { type, additionalParams } = req.body;
            const modelConfig = QuorumDataController.MODELS[type];
            if (!modelConfig) return res.status(400).json({ error: "Invalid data type" });

            // Check circuit breaker state
            const circuitBreaker = this._circuitBreakers.quorum;
            if (!circuitBreaker.canRequest()) {
                return res.status(503).json({ 
                    error: "Service unavailable", 
                    message: "API service is currently unavailable, please try again later" 
                });
            }

            // Set a response timeout
            const timeoutId = setTimeout(() => {
                return res.status(408).json({ 
                    error: "Request timeout", 
                    message: "Data fetch is taking too long. The process will continue in the background." 
                });
            }, cacheConfig.TIMEOUTS.SERVER_RESPONSE);

            // Start data fetch
            const fetchPromise = this.fetchData(type, additionalParams);
            
            // Execute in background if it takes too long
            fetchPromise.then(async rawData => {
                clearTimeout(timeoutId);
                
                if (!rawData.length) {
                    if (!res.headersSent) {
                        return res.status(400).json({ error: `No valid ${type} data` });
                    }
                    return;
                }

                const filtered = await this.filterData(type, rawData);
                if (!filtered.length) {
                    if (!res.headersSent) {
                        return res.status(400).json({ error: `Filtered ${type} data is empty` });
                    }
                    return;
                }

                if (type === "bills") {
                    if (!res.headersSent) {
                        return res.json({ message: "Bills fetched", data: filtered });
                    }
                    return;
                }

                const { model, idField } = modelConfig;
                
                // Use batch sizes from config
                const BATCH_SIZE = cacheConfig.BATCH_SIZES.DATABASE_OPERATIONS;
                for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
                    const batch = filtered.slice(i, i + BATCH_SIZE);
                    await model.bulkWrite(batch.map(item => ({
                        updateOne: {
                            filter: { [idField]: item[idField] },
                            update: { $set: item },
                            upsert: true
                        }
                    })));
                }

                if (!res.headersSent) {
                    res.json({ message: `${type} data saved successfully` });
                }
            }).catch(err => {
                clearTimeout(timeoutId);
                console.error("Save error:", err);
                if (!res.headersSent) {
                    res.status(500).json({ error: "Failed to store data" });
                }
            });
        } catch (err) {
            console.error("Save error:", err);
            res.status(500).json({ error: "Failed to store data" });
        }
    }

    async saveBills(req, res) {
        try {
            const { bills } = req.body;
            if (!Array.isArray(bills) || !bills.length) return res.status(400).json({ error: "Invalid bills" });

            const { model, idField } = QuorumDataController.MODELS.bills;

            // Save bills (upsert) - do this in parallel for better performance
            const savedPromises = bills.map(bill => 
                model.updateOne({ [idField]: bill[idField] }, { $set: bill }, { upsert: true })
                    .then(() => model.findOne({ [idField]: bill[idField] }))
            );
            
            const saved = await Promise.all(savedPromises);

            // Respond immediately
            res.json({ message: "Bills saved. Summary and vote score updates running in background.", data: saved });

            // Background: update summaries and vote scores (no await)
            (async () => {
                try {
                    await this.updateBillShortDesc(saved);
                    
                    // Process vote scores in chunks to avoid overwhelming the API
                    const CHUNK_SIZE = cacheConfig.BATCH_SIZES.VOTE_UPDATES;
                    for (let i = 0; i < saved.length; i += CHUNK_SIZE) {
                        const chunk = saved.slice(i, i + CHUNK_SIZE);
                        await Promise.all(chunk.map(bill => this.updateVoteScore(bill.quorumId)));
                    }
                } catch (err) {
                    console.error("Background update error:", err);
                }
            })();

        } catch (err) {
            console.error("Save bills error:", err);
            res.status(500).json({ error: "Failed to store bills" });
        }
    }

    async updateBillShortDesc(bills) {
        const { model, idField } = QuorumDataController.MODELS.bills;

        // Process in smaller batches using config
        const BATCH_SIZE = cacheConfig.BATCH_SIZES.BILL_UPDATES;
        for (let i = 0; i < bills.length; i += BATCH_SIZE) {
            const batch = bills.slice(i, i + BATCH_SIZE);
            
            await Promise.all(batch.map(async bill => {
                try {
                    // Queue the API request
                    const fetchTask = () => apiClient.get(`https://www.quorum.us/api/newbillsummary/${bill[idField]}/`, {
                        params: {
                            api_key: process.env.QUORUM_API_KEY,
                            username: process.env.QUORUM_USERNAME,
                            limit: 1
                        }
                    });
                    
                    const { data } = await this._requestQueue.add(fetchTask);
                    const shortDesc = data?.content || "No description available";
                    await model.updateOne({ [idField]: bill[idField] }, { $set: { shortDesc } });
                } catch (err) {
                    if (err.response?.status === 404) {
                        console.warn(`No summary found for bill ${bill[idField]}`);
                    } else {
                        console.error(`Summary error for bill ${bill[idField]}:`, err.message);
                    }
                }
            }));
        }
    }

    async updateVoteScore(quorumId) {
        try {
            // Queue the API request
            const fetchTask = () => apiClient.get(process.env.VOTE_API_URL, {
                params: {
                    api_key: process.env.QUORUM_API_KEY,
                    username: process.env.QUORUM_USERNAME,
                    related_bill: quorumId,
                    limit: 2
                }
            });
            
            const response = await this._requestQueue.add(fetchTask);
            const data = response.data?.objects?.[0];
            if (!data) return;

            const vote = await Bill.findOne({ quorumId });
            if (!vote) return;

            const { bill_type } = data.related_bill || {};
            const voteTypes = {
                senate_bill: { personModel: Senator, dataModel: SenatorData, idField: "senateId", refField: "senatorId" },
                house_bill: { personModel: Representative, dataModel: RepresentativeData, idField: "houseId", refField: "repId" }
            };

            const voteConfig = voteTypes[bill_type];
            if (!voteConfig) return;

            const { personModel, dataModel, idField } = voteConfig;
            const votes = ["yea", "nay", "present", "other"];
            
            // First get all the necessary person data in a single query instead of individual queries
            const voteUris = votes.flatMap(score => data[`${score}_votes`] || []);
            const personIds = voteUris.map(uri => uri?.replace(/\/$/, "").split("/").pop()).filter(Boolean);
            
            if (!personIds.length) return;
            
            const persons = await personModel.find({ [voteConfig.refField]: { $in: personIds } });
            const personMap = Object.fromEntries(persons.map(p => [p[voteConfig.refField], p]));
            
            // Batch updates by vote type
            const updates = [];
            
            for (const score of votes) {
                const uris = data[`${score}_votes`] || [];
                for (const uri of uris) {
                    const personId = uri?.replace(/\/$/, "").split("/").pop();
                    const person = personMap[personId];
                    if (!person) continue;
                    
                    updates.push({
                        filter: { [idField]: person._id, "votesScore.voteId": { $ne: vote._id } },
                        update: { $push: { votesScore: { voteId: vote._id, score } } }
                    });
                }
            }
            
            // Perform updates in batches
            const BATCH_SIZE = 50;
            for (let i = 0; i < updates.length; i += BATCH_SIZE) {
                const batch = updates.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(update => 
                    dataModel.updateOne(update.filter, update.update, { upsert: true })
                ));
            }
        } catch (err) {
            console.error("Vote score update failed:", err.message);
        }
    }
}

module.exports = new QuorumDataController();
