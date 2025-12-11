require("dotenv").config();
const axios = require("axios");
const cacheConfig = require("../config/cache-config");
const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const Bill = require("../models/voteSchema");
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");
const ActivityController = require("../controllers/activityController");
const imageDownloader = require("../helper/imageDownloader");
const { updateBillRollCall } = require("../helper/billRollCallHelper");
const { updateVoteScore } = require("../helper/voteScoreHelper");

class CircuitBreaker {
  constructor(host) {
    this.host = host;
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.failureThreshold = 3;
    this.resetTimeout = 30000;
    this.successThreshold = 2;
  }

  success() {
    this.failureCount = 0;
    if (this.state === "HALF-OPEN") {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.successCount = 0;
        this.state = "CLOSED";
      }
    }
  }

  failure() {
    this.lastFailureTime = Date.now();
    this.failureCount++;
    if (this.state === "CLOSED" && this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
    }
  }

  canRequest() {
    if (this.state === "CLOSED") {
      return true;
    }

    if (this.state === "OPEN") {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.resetTimeout) {
        this.state = "HALF-OPEN";
        this.successCount = 0;
        return true;
      }
      return false;
    }

    return this.state === "HALF-OPEN";
  }
}
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
      .then((result) => {
        resolve(result);
        this.running--;
        this.process();
      })
      .catch((err) => {
        reject(err);
        this.running--;
        this.process();
      });
  }
}
const apiClient = axios.create({
  timeout: cacheConfig.TIMEOUTS.API_REQUEST,
});
apiClient.interceptors.response.use(null, async (error) => {
  const config = error.config;
  if (!config || !config.method || config.method.toLowerCase() !== "get") {
    return Promise.reject(error);
  }
  config.__retryCount = config.__retryCount || 0;
  const maxRetries = 2;

  if (config.__retryCount >= maxRetries) {
    return Promise.reject(error);
  }
  config.__retryCount += 1;
  const delay = config.__retryCount * 1000; // 1s, 2s

  await new Promise((resolve) => setTimeout(resolve, delay));

  return apiClient(config);
});
function getCacheKey(type, params) {
  if (params && Object.keys(params).length > 0) {
    const sorted = Object.keys(params)
      .sort()
      .reduce((acc, key) => {
        acc[key] = params[key];
        return acc;
      }, {});
    return `${type}:${JSON.stringify(sorted)}`;
  }
  return type;
}

function formatDistrict(district) {
  return district.replace(/^([A-Z]+)(\d+)$/, "$1-$2");
}

class QuorumDataController {
  constructor() {
    this.saveData = this.saveData.bind(this);
    this.saveBills = this.saveBills.bind(this);
    this.getDataStatus = this.getDataStatus.bind(this);
    this._dataCache = {
      senator: { data: null, timestamp: 0 },
      representative: { data: null, timestamp: 0 },
      bills: { data: null, timestamp: 0 }, // ❌ NOT IN USE (kept for reference)
      state: { data: null, timestamp: 0 },
      district: { data: null, timestamp: 0 },
    };
    this._CACHE_TTL = {
      senator: cacheConfig.CACHE_TTL.SENATOR,
      representative: cacheConfig.CACHE_TTL.REPRESENTATIVE,
      bills: cacheConfig.CACHE_TTL.BILLS, // ❌ NOT IN USE (kept for reference)
      state: cacheConfig.CACHE_TTL.STATE,
      district: cacheConfig.CACHE_TTL.DISTRICT,
    };
    this._circuitBreakers = {
      quorum: new CircuitBreaker("quorum.us"),
    };
    this._requestQueue = new RequestQueue(cacheConfig.CONCURRENT_REQUESTS || 5);
  }

  static API_URLS = {
    // ✅ IN USE
    senator:
      process.env.QUORUM_SENATOR_API || "https://www.quorum.us/api/newperson/",
    representative:
      process.env.QUORUM_REP_API || "https://www.quorum.us/api/newperson/",
    votes: process.env.VOTE_API_URL || "https://www.quorum.us/api/vote/",

    // ❌ NOT IN USE (kept for reference only)
    bills: process.env.BILL_API_URL || "https://www.quorum.us/api/newbill/",
  };

  static MODELS = {
    senator: { model: Senator, idField: "senatorId" },
    representative: { model: Representative, idField: "repId" },
    bills: { model: Bill, idField: "quorumId" },
    votes: { model: Bill, idField: "quorumId" },
  };
  async fetchFromApi(url, params, cacheKey) {
    if (cacheKey) {
      const cache = this._dataCache[cacheKey];
      const now = Date.now();
      const ttl = this._CACHE_TTL[cacheKey] || cacheConfig.CACHE_TTL.DEFAULT;
      if (cache?.data && now - cache.timestamp < ttl) {
        return cache.data;
      }
    }
    const circuitBreaker = this._circuitBreakers.quorum;
    if (!circuitBreaker.canRequest()) {
      if (cacheKey && this._dataCache[cacheKey]?.data) {
        return this._dataCache[cacheKey].data;
      }
      return [];
    }
    try {
      const fetchTask = () => apiClient.get(url, { params });
      const response = await this._requestQueue.add(fetchTask);
      circuitBreaker.success();
      if (!response.data || !Array.isArray(response.data.objects)) return [];
      if (cacheKey) {
        this._dataCache[cacheKey] = {
          data: response.data.objects,
          timestamp: Date.now(),
        };
      }

      return response.data.objects;
    } catch (error) {
      circuitBreaker.failure();
      console.error(`API fetch error for ${url}:`, error.message);
      if (cacheKey && this._dataCache[cacheKey]?.data) {
        return this._dataCache[cacheKey].data;
      }
      return [];
    }
  }

  async fetchStateData() {
    const params = {
      api_key: process.env.QUORUM_API_KEY,
      username: process.env.QUORUM_USERNAME,
      limit: 400,
    };

    const data = await this.fetchFromApi(
      "https://www.quorum.us/api/state/",
      params,
      "state"
    );
    return Object.fromEntries(
      data.map((state) => [state.resource_uri, state.name])
    );
  }

  async fetchDistrictData() {
    const params = {
      api_key: process.env.QUORUM_API_KEY,
      username: process.env.QUORUM_USERNAME,
      limit: 1000,
    };

    const data = await this.fetchFromApi(
      "https://www.quorum.us/api/district/",
      params,
      "district"
    );
    return Object.fromEntries(
      data.map((d) => [d.resource_uri, d.kw_DistrictCode || d.name])
    );
  }

  async fetchData(type, additionalParams = {}) {
    if (!QuorumDataController.API_URLS[type])
      throw new Error(`Invalid API type: ${type}`);

    const cacheKey = getCacheKey(type, additionalParams);
    const cache = this._dataCache[cacheKey];
    const now = Date.now();

    if (
      cache?.data &&
      now - cache.timestamp <
        (this._CACHE_TTL[type] || cacheConfig.CACHE_TTL.DEFAULT)
    ) {
      console.log(
        `🔄 [${type}] Returning cached data with ${cache.data.length} items`
      );
      return cache.data;
    }

    const circuitBreaker = this._circuitBreakers.quorum;
    if (!circuitBreaker.canRequest()) {
      if (cache?.data) {
        console.log(
          `🚨 [${type}] Circuit breaker OPEN, returning stale cache with ${cache.data.length} items`
        );
        return cache.data;
      }
      return [];
    }

    const allData = [];
    const limit =
      {
        senator: 100,
        representative: 250,
        votes: 20, // Reduced for votes to avoid timeouts
        bills: 20, // ❌ NOT IN USE (kept for reference)
      }[type] || 20;

    const maxRecords =
      {
        senator: 120,
        representative: 20000,
        votes: 20, // Limit votes to 50 for testing
        bills: 20, // ❌ NOT IN USE (kept for reference)
      }[type] || 1000;

    try {
      // Transform search params for more flexible searching
      const processedParams = { ...additionalParams };

      // For votes, enable partial matching on question field
      if (type === "votes" && processedParams.question) {
        // Use __icontains for case-insensitive partial matching
        processedParams.question__icontains = processedParams.question;
        delete processedParams.question;
      }

      // For votes, enable partial matching on related bill title field
      if (type === "votes" && processedParams.billTitle) {
        // Use __icontains for case-insensitive partial matching on nested related_bill.title
        // This searches in the related_bill.title field (e.g., "S.Con.Res. 14: A concurrent resolution...")
        processedParams.related_bill__title__icontains = processedParams.billTitle;
        delete processedParams.billTitle;
      }

      // For votes, enable partial matching on related bill label (e.g., "S.Con.Res. 14", "H.R. 1234")
      if (type === "votes" && processedParams.billLabel) {
        // Use __icontains for case-insensitive partial matching on nested related_bill.label
        processedParams.related_bill__label__icontains = processedParams.billLabel;
        delete processedParams.billLabel;
      }

      // For bills, enable partial matching on title field

      const firstParams = {
        api_key: process.env.QUORUM_API_KEY,
        username: process.env.QUORUM_USERNAME,
        limit,
        offset: 0,
        ...processedParams,
        ...(type === "bills" || type === "votes" ? { region: "federal" } : {}),
        ...(type === "senator"
          ? { current: true }
          : type === "representative"
          ? { current: true, most_recent_role_type: 2 }
          : {}),
      };

      // // Enhanced logging for votes
      // if (type === "votes") {

      //   if (firstParams.number || additionalParams.number) {
      //     console.log(
      //       "🔢 [VOTES DEBUG] Roll call number search:",
      //       firstParams.number || additionalParams.number
      //     );
      //     console.log("   - Number param:", firstParams.number);
      //     console.log("   - Number type:", typeof firstParams.number);
      //   }

      //   if (firstParams.related_bill || additionalParams.related_bill) {
      //     console.log(
      //       "📋 [VOTES DEBUG] Related bill search:",
      //       firstParams.related_bill || additionalParams.related_bill
      //     );
      //   }
      // }

      const fetchTask = () =>
        apiClient.get(QuorumDataController.API_URLS[type], {
          params: firstParams,
        });

      const response = await this._requestQueue.add(fetchTask);
      circuitBreaker.success();

      if (!response.data?.objects?.length) {
        return [];
      }

      allData.push(...response.data.objects);

      // Log sample data for votes
      // if (type === "votes" && response.data.objects.length > 0) {

      //   response.data.objects.slice(0, 3).forEach((vote, index) => {
      //     console.log(
      //       `   ${index + 1}. ID: ${vote.id}, Number: ${
      //         vote.number
      //       }, Question: ${vote.question?.substring(0, 50)}...`
      //     );
      //     console.log(
      //       `      Chamber: ${vote.chamber}, Category: ${vote.category}, Result: ${vote.result}`
      //     );
      //     console.log(`      Date: ${vote.created}, Region: ${vote.region}`);
      //     if (vote.related_bill) {
      //       console.log(
      //         `      Related Bill: ${
      //           vote.related_bill.id
      //         } - ${vote.related_bill.title?.substring(0, 30)}...`
      //       );
      //     }
      //   });
      // }

      if (response.data.meta?.next && type !== "bills") {
        const totalCount = response.data.meta.total_count;
        const totalPages = Math.min(
          Math.ceil(totalCount / limit),
          Math.ceil(maxRecords / limit) - 1
        );
        const maxParallelRequests = cacheConfig.MAX_PARALLEL_PAGES || 3;

        for (let page = 1; page <= totalPages; page += maxParallelRequests) {
          const pagePromises = [];
          for (
            let i = 0;
            i < maxParallelRequests && page + i <= totalPages;
            i++
          ) {
            const pageOffset = (page + i) * limit;
            const pageParams = { ...firstParams, offset: pageOffset };

            const pageTask = () =>
              apiClient
                .get(QuorumDataController.API_URLS[type], {
                  params: pageParams,
                })
                .then((res) => {
                  return res.data?.objects || [];
                })
                .catch((err) => {
                  console.error(
                    `   ❌ [${type}] Page ${page + i} fetch error:`,
                    err.message
                  );
                  return [];
                });

            pagePromises.push(this._requestQueue.add(pageTask));
          }

          const pageResults = await Promise.all(pagePromises);
          pageResults.forEach((pageData, index) => {
            if (pageData.length > 0) {
              allData.push(...pageData);
            }
          });

          if (allData.length >= maxRecords) {
            break;
          }

          // Cache intermediate results
          if (page % 3 === 0 || page + maxParallelRequests > totalPages) {
            const trimmedIntermediateData = this.trimDataForMemory(
              allData.slice(0, maxRecords),
              type
            );
            this._dataCache[cacheKey] = {
              data: trimmedIntermediateData,
              timestamp: now,
            };
          }
        }
      }

      const trimmedData = this.trimDataForMemory(
        allData.slice(0, maxRecords),
        type
      );

      this._dataCache[cacheKey] = {
        data: trimmedData,
        timestamp: now,
      };

      return trimmedData;
    } catch (error) {
      circuitBreaker.failure();
      console.error(`❌ [${type}] Failed to fetch data:`, error.message);
      console.error(
        `   - Error details:`,
        error.response?.data || error.message
      );

      if (cache?.data) {
        return cache.data;
      }

      return [];
    }
  }
  trimDataForMemory(data, type) {
    if (!data || !data.length) return data;
    const keepFields = {
      senator: [
        "id",
        "firstname",
        "middlename",
        "lastname",
        "title",
        "most_recent_party",
        "most_recent_state",
        "high_quality_image_url",
        "image_url",
      ],
      representative: [
        "id",
        "firstname",
        "middlename",
        "lastname",
        "title",
        "most_recent_party",
        "most_recent_district",
        "minr_person_types",
        "high_quality_image_url",
        "image_url",
      ],
      bills: ["id", "title", "bill_type", "introduced_date", "region"],
      votes: [
        "id",
        "number",
        "question",
        "chamber",
        "category",
        "created",
        "region",
        "related_bill",
      ],
      state: null,
      district: null,
    };
    if (!keepFields[type]) return data;
    const fieldsToKeep = new Set(keepFields[type]);
    const BATCH_SIZE = 500;
    const trimmed = [];

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
      const batchResult = batch.map((item) => {
        const trimmedItem = {};
        for (const field of fieldsToKeep) {
          if (item[field] !== undefined) {
            trimmedItem[field] = item[field];
          }
        }
        return trimmedItem;
      });

      trimmed.push(...batchResult);
    }

    return trimmed;
  }

  async filterData(type, data) {
    if (!data || data.length === 0) {
      return [];
    }

    const partyMap = { 1: "democrat", 2: "republican", 3: "independent" };
    const [stateMap, districtMap] = await Promise.all([
      this.fetchStateData(),
      this.fetchDistrictData(),
    ]);

    const mappings = {
      senator: async (item) => {
        if (item.title === "US Senator") {
          let photoPath = null;

          const imageUrl = item.high_quality_image_url || item.image_url;
          if (imageUrl) {
            try {
              const fileName = imageDownloader.generateFileName(
                "senator",
                item.id,
                imageUrl
              );
              photoPath = await imageDownloader.downloadImage(
                imageUrl,
                "senator",
                fileName
              );
            } catch (error) {
              console.error(
                `Failed to download image for senator ${item.id}:`,
                error.message
              );
              photoPath = null;
            }
          }

          return {
            senatorId: item.id,
            name: `Sen. ${item.firstname || ""} ${item.middlename || ""} ${
              item.lastname || ""
            }`.trim(),
            party: partyMap[item.most_recent_party] || "Unknown",
            photo: photoPath,
            state: stateMap[item.most_recent_state] || "Unknown",
          };
        }
        return null;
      },

      representative: async (item) => {
        if (item.title === "US Representative") {
          let photoPath = null;

          const imageUrl = item.high_quality_image_url || item.image_url;
          if (imageUrl) {
            try {
              const fileName = imageDownloader.generateFileName(
                "representative",
                item.id,
                imageUrl
              );
              photoPath = await imageDownloader.downloadImage(
                imageUrl,
                "representative",
                fileName
              );
            } catch (error) {
              console.error(
                `Failed to download image for rep ${item.id}:`,
                error.message
              );
              photoPath = null;
            }
          }

          return {
            repId: item.id,
            name: `Rep. ${item.firstname || ""} ${item.middlename || ""} ${
              item.lastname || ""
            }`.trim(),
            party: partyMap[item.most_recent_party] || "Unknown",
            photo: photoPath,
            odistrict: formatDistrict(
              districtMap[item.most_recent_district] || "Unknown"
            ),
          };
        }
        return null;
      },

      // Bills API is currently  use for activity save
      bills: (item) => {
        // ⭐⭐⭐ ONLY PROCESS FEDERAL BILLS ⭐⭐⭐
        const isFederalBill = item.region === "federal";

        if (isFederalBill) {
          return {
            quorumId: item.id,
            title: item.title || "Unknown",
            type: item.bill_type || "Unknown",
            date: item.introduced_date || "Unknown",
            region: item.region, // Keep region for verification
            isFederal: true, // Add flag for clarity
          };
        }
        return null; // Skip state bills
      },
      // In the filterData method, update the votes mapping:
      votes: (item) => {
        // Only process federal votes
        const isFederalVote = item.region === "federal";

        if (isFederalVote) {
          // Add date filtering - only votes from 2015 onwards
          const voteDate = new Date(item.created || item.date);
          const voteYear = voteDate.getFullYear();

          // Skip votes before 2015
          if (voteYear < 2015) {
            return null;
          }

          const chamberBasedType =
            item.chamber?.toLowerCase() === "senate"
              ? "senate_vote"
              : item.chamber?.toLowerCase() === "house"
              ? "house_vote"
              : "vote";

          const filteredVote = {
            voteId: item.id,
            rollCallNumber: item.number || 0,
            question: item.question || "Unknown",
            chamber: item.chamber || "Unknown",
            category: item.category || "Unknown",
            date: item.created || "Unknown",
            type: chamberBasedType, // This will be 'senate_vote' or 'house_vote'
            relatedBill: item.related_bill
              ? {
                  id: item.related_bill.id,
                  title: item.related_bill.title,
                  label: item.related_bill.label,
                }
              : null,
            region: item.region,
            isFederal: true,
          };

          return filteredVote;
        }

        return null;
      },
    };

    const BATCH_SIZE = 250;
    const filtered = [];

    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(mappings[type]);
      const batchResult = await Promise.all(batchPromises);

      // Filter out null values (votes before 2015 and other filtered items)
      const validResults = batchResult.filter(Boolean);
      filtered.push(...validResults);

      if (data.length > 500 && i % 500 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return filtered;
  }

  async saveData(req, res) {
    try {
      const { type, additionalParams } = req.body;
      const modelConfig = QuorumDataController.MODELS[type];
      if (!modelConfig)
        return res.status(400).json({ error: "Invalid data type" });
      const circuitBreaker = this._circuitBreakers.quorum;
      if (!circuitBreaker.canRequest()) {
        return res.status(503).json({
          error: "Service unavailable",
          message:
            "API service is currently unavailable, please try again later",
        });
      }
      let responseHandled = false;
      let timeoutId = null;
      const cacheKey = getCacheKey(type, additionalParams);
      const cache = this._dataCache[cacheKey];
      const now = Date.now();
      const isCacheValid =
        cache?.data &&
        now - cache.timestamp <
          (this._CACHE_TTL[type] || cacheConfig.CACHE_TTL.DEFAULT);

      if (isCacheValid && cache.data.length > 0) {
        const filtered = await this.filterData(type, cache.data);
        res.status(200).json({
          message: `${type} data available from cache`,
          count: filtered.length,
          source: "cache",
          data: filtered,
        });
        responseHandled = true;
      } else {
        timeoutId = setTimeout(() => {
          responseHandled = true;
          return res.status(202).json({
            status: "processing",
            message: `${type} data fetch is in progress. Check status at /fetch-quorum/status/${type}`,
            type: type,
          });
        }, cacheConfig.TIMEOUTS.SERVER_RESPONSE);
      }
      const fetchPromise = this.fetchData(type, additionalParams);
      fetchPromise
        .then(async (rawData) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          if (!rawData.length) {
            if (!responseHandled) {
              return res.status(400).json({ error: `No valid ${type} data` });
            }
            return;
          }

          const filtered = await this.filterData(type, rawData);
          if (!filtered.length) {
            if (!responseHandled) {
              return res
                .status(400)
                .json({ error: `Filtered ${type} data is empty` });
            }
            return;
          }

          //   Bill API fetch for activity purpose
          if (type === "bills") {
            if (!responseHandled) {
              return res.json({
                message: "Bills fetched successfully",
                count: filtered.length,
                data: filtered,
              });
            }
            return;
          }

          // In your saveData method, add votes handling
          if (type === "votes") {
            if (!responseHandled) {
              return res.json({
                message: "Votes fetched successfully",
                count: filtered.length,
                data: filtered,
              });
            }
            return;
          }
          const { model, idField } = modelConfig;
          const BATCH_SIZE = cacheConfig.BATCH_SIZES.DATABASE_OPERATIONS;
          const totalBatches = Math.ceil(filtered.length / BATCH_SIZE);
          let savedCount = 0;
          for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
            const batch = filtered.slice(i, i + BATCH_SIZE);
            const batchNum = Math.floor(i / BATCH_SIZE) + 1;
            const result = await model.bulkWrite(
              batch.map((item) => ({
                updateOne: {
                  filter: { [idField]: item[idField] },
                  update: { $set: item },
                  upsert: true,
                },
              }))
            );
            savedCount += result.upsertedCount + result.modifiedCount;
          }
          if (!responseHandled) {
            res.json({
              message: `${type} data saved successfully`,
              count: filtered.length,
              savedCount: savedCount,
            });
          } else {
          }
        })
        .catch((err) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          console.error("Save error:", err);
          if (!responseHandled) {
            res.status(500).json({
              error: "Failed to store data",
              message: err.message,
              type: type,
            });
          }
        });
    } catch (err) {
      console.error("Save error:", err);
      res.status(500).json({
        error: "Failed to store data",
        message: err.message,
        type: req.body?.type || "unknown",
      });
    }
  }
  async saveBills(req, res) {
    try {
      const { bills, editorInfo } = req.body;
      if (!Array.isArray(bills) || bills.length === 0) {
        return res.status(400).json({ error: "Invalid bills" });
      }
      const { model, idField } = QuorumDataController.MODELS.bills;
      const savedPromises = bills.map(async (bill) => {
        const introducedDate = bill.date ? new Date(bill.date) : new Date();
        const year = introducedDate.getUTCFullYear();

        const congress = Math.floor((year - 1789) / 2) + 1;
        const congressStartYear = 1789 + (congress - 1) * 2;
        const congressEndYear = congressStartYear + 1;
        const termId = `${congressStartYear}-${congressEndYear}`;
        bill.congress = String(congress);
        bill.termId = termId;

        // Ensure type is set correctly for votes
        if (bill.type === "vote") {
          // If it's a generic vote, set type based on chamber
          if (bill.chamber?.toLowerCase() === "senate") {
            bill.type = "senate_vote";
          } else if (bill.chamber?.toLowerCase() === "house") {
            bill.type = "house_vote";
          }
        }

        // ✅ NEW: Transform nested relatedBill to flat schema fields
        if (bill.relatedBill && bill.relatedBill.id) {
          bill.releatedBillid = String(bill.relatedBill.id);
          bill.relatedBillTitle = bill.relatedBill.title || "";

          delete bill.relatedBill;
        }

        await model.updateOne(
          { [idField]: bill[idField] },
          { $setOnInsert: bill },
          { upsert: true }
        );
        return model.findOne({ [idField]: bill[idField] });
      });
      const saved = await Promise.all(savedPromises);

      // Update roll call synchronously before sending response
      try {
        await updateBillRollCall(saved, apiClient, this._requestQueue);
      } catch (rollCallError) {
        console.error("Roll call update error:", rollCallError);
        // Continue even if roll call update fails
      }

      res.json({
        message:
          "Bills saved with roll call data. Cosponsorship & vote updates running in background.",
        data: saved,
      });
      (async () => {
        try {
          // ❌ DISABLED: Bill Summary API (not needed)
          // await this.updateBillShortDesc(saved);

          const CHUNK_SIZE = cacheConfig.BATCH_SIZES.VOTE_UPDATES;
          const models = {
            Bill,
            Senator,
            Representative,
            SenatorData,
            RepresentativeData,
          };
          for (let i = 0; i < saved.length; i += CHUNK_SIZE) {
            const chunk = saved.slice(i, i + CHUNK_SIZE);
            await Promise.all(
              chunk.map((bill) =>
                updateVoteScore(
                  bill.quorumId,
                  editorInfo,
                  apiClient,
                  this._requestQueue,
                  models
                )
              )
            );
          }
          for (const item of saved) {
            try {
              // Check if this is a vote or bill
              const isVote =
                item.type === "senate_vote" || item.type === "house_vote";

              // ✅ EXTRACT FROM NESTED relatedBill OBJECT
              // ✅ Use flat schema fields
              // if (isVote && item.releatedBillid) {
              //   console.log(`   - releatedBillid: ${item.releatedBillid}`);
              //   console.log(`   - relatedBillTitle: ${item.relatedBillTitle}`);
              // } else {
              //   console.log(`   - relatedBill: N/A`);
              // }

              // For votes, use releatedBillid and relatedBillTitle from schema
              // For bills, use their own quorumId and title
              const billIdForActivity =
                isVote && item.releatedBillid
                  ? String(item.releatedBillid)
                  : String(item.quorumId);

              const billTitleForActivity =
                isVote && item.relatedBillTitle
                  ? String(item.relatedBillTitle)
                  : String(item.title || "Untitled Bill/Vote");

              // Skip if no valid bill ID
              if (
                !billIdForActivity ||
                billIdForActivity === "null" ||
                billIdForActivity === "undefined"
              ) {
                continue;
              }

              // For votes without related bills, skip activity creation
              if (isVote && !item.releatedBillid) {
                continue;
              }

              // Determine the date to use for activity
              let dateForActivity = item.date || new Date().toISOString();

              // For votes with related bills, fetch the bill date from database
              if (isVote && item.releatedBillid) {
                try {
                  const relatedBill = await Bill.findOne({
                    quorumId: item.releatedBillid,
                  });
                  if (relatedBill && relatedBill.date) {
                    dateForActivity = relatedBill.date;
                  } else {
                    console.log(
                      `   ⚠️ Related bill not found in DB, using vote date: ${dateForActivity}`
                    );
                  }
                } catch (fetchErr) {
                  console.warn(
                    `   ⚠️ Could not fetch related bill date: ${fetchErr.message}`
                  );
                }
              } else {
                console.log(
                  `   📅 Using ${
                    isVote ? "vote" : "bill"
                  } date: ${dateForActivity}`
                );
              }

              const result =
                await ActivityController.fetchAndCreateFromCosponsorships(
                  billIdForActivity,
                  billTitleForActivity,
                  dateForActivity,
                  item.congress,
                  editorInfo
                );
            } catch (err) {
              console.error(
                `\n   ❌ [QUORUM CONTROLLER] Cosponsorship fetch failed for ${item.quorumId}`
              );
              console.error(`      Error: ${err.message}`);
              console.error(`      Stack:`, err.stack);
            }
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

  // ❌❌❌ DISABLED METHOD - NOT IN USE ❌❌❌
  // This method fetches bill summaries from Quorum API: /api/newbillsummary/
  // Currently disabled because bill summary API is not needed
  async updateBillShortDesc(bills) {
    const { model, idField } = QuorumDataController.MODELS.bills;
    const BATCH_SIZE = cacheConfig.BATCH_SIZES.BILL_UPDATES;
    for (let i = 0; i < bills.length; i += BATCH_SIZE) {
      const batch = bills.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (bill) => {
          try {
            const fetchTask = () =>
              apiClient.get(
                `https://www.quorum.us/api/newbillsummary/${bill[idField]}/`,
                {
                  params: {
                    api_key: process.env.QUORUM_API_KEY,
                    username: process.env.QUORUM_USERNAME,
                    limit: 1,
                  },
                }
              );

            const { data } = await this._requestQueue.add(fetchTask);
            const shortDesc = data?.content || "No description available";
            await model.updateOne(
              { [idField]: bill[idField] },
              { $set: { shortDesc } }
            );
          } catch (err) {
            if (err.response?.status === 404) {
              console.warn(`No summary found for bill ${bill[idField]}`);
            } else {
              console.error(
                `Summary error for bill ${bill[idField]}:`,
                err.message
              );
            }
          }
        })
      );
    }
  }
  async getDataStatus(req, res) {
    try {
      const { type } = req.params;

      if (!type || !QuorumDataController.MODELS[type]) {
        return res.status(400).json({ error: "Invalid data type" });
      }
      const cache = this._dataCache[type];
      const now = Date.now();
      const cacheAge = now - (cache?.timestamp || 0);
      const ttl = this._CACHE_TTL[type] || cacheConfig.CACHE_TTL.DEFAULT;
      const isCacheValid = cache?.data && cacheAge < ttl;
      const circuitBreaker = this._circuitBreakers.quorum;
      const circuitStatus = circuitBreaker.state;
      const { model } = QuorumDataController.MODELS[type];
      const count = await model.countDocuments();
      return res.json({
        type,
        cache: {
          available: !!cache?.data,
          valid: isCacheValid,
          itemCount: cache?.data?.length || 0,
          age: cacheAge ? Math.round(cacheAge / 1000) + " seconds" : "N/A",
          ttl: Math.round(ttl / 1000) + " seconds",
        },
        database: {
          recordCount: count,
        },
        apiService: {
          circuitStatus,
          available: circuitBreaker.canRequest(),
        },
      });
    } catch (err) {
      console.error("Data status error:", err);
      res
        .status(500)
        .json({ error: "Failed to get data status", message: err.message });
    }
  }
}

module.exports = new QuorumDataController();
