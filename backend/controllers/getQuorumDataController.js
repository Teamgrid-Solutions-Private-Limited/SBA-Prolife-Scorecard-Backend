require("dotenv").config();
const axios = require("axios");
const cacheConfig = require("../config/cache-config");
const activitySchema = require("../models/activitySchema");
const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const Bill = require("../models/voteSchema");
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");
const ActivityController = require("../controllers/activityController");
const mongoose = require("mongoose");
const  imageDownloader  = require("../helper/imageDownloader");
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
    this.updateVoteScore = this.updateVoteScore.bind(this);
    this.getDataStatus = this.getDataStatus.bind(this);
    this._dataCache = {
      senator: { data: null, timestamp: 0 },
      representative: { data: null, timestamp: 0 },
      bills: { data: null, timestamp: 0 },
      state: { data: null, timestamp: 0 },
      district: { data: null, timestamp: 0 },
    };
    this._CACHE_TTL = {
      senator: cacheConfig.CACHE_TTL.SENATOR,
      representative: cacheConfig.CACHE_TTL.REPRESENTATIVE,
      bills: cacheConfig.CACHE_TTL.BILLS,
      state: cacheConfig.CACHE_TTL.STATE,
      district: cacheConfig.CACHE_TTL.DISTRICT,
    };
    this._circuitBreakers = {
      quorum: new CircuitBreaker("quorum.us"),
    };
    this._requestQueue = new RequestQueue(cacheConfig.CONCURRENT_REQUESTS || 5);
  }

  static API_URLS = {
    senator:
      process.env.QUORUM_SENATOR_API || "https://www.quorum.us/api/newperson/",
    representative:
      process.env.QUORUM_REP_API || "https://www.quorum.us/api/newperson/",
    bills: process.env.BILL_API_URL || "https://www.quorum.us/api/newbill/",
  };

  static MODELS = {
    senator: { model: Senator, idField: "senatorId" },
    representative: { model: Representative, idField: "repId" },
    bills: { model: Bill, idField: "quorumId" },
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

      return cache.data;
    }
    const circuitBreaker = this._circuitBreakers.quorum;
    if (!circuitBreaker.canRequest()) {
      if (cache?.data) {

        return cache.data;
      }
      return [];
    }

    const allData = [];
    const limit =
      {
        senator: 100,
        representative: 250, 
        bills: 20,
      }[type] || 20;
    const maxRecords =
      {
        senator: 120,
        representative: 20000, 
        bills: 20,
      }[type] || 1000;

    try {
      const firstParams = {
        api_key: process.env.QUORUM_API_KEY,
        username: process.env.QUORUM_USERNAME,
        limit,
        offset: 0,
        ...additionalParams,
        ...(type === "senator"
          ? { current: true }
          : type === "representative"
            ? { current: true, most_recent_role_type: 2 }
            : {}),
      };
      const fetchTask = () =>
        apiClient.get(QuorumDataController.API_URLS[type], {
          params: firstParams,
        });
      const response = await this._requestQueue.add(fetchTask);
      circuitBreaker.success();

      if (!response.data?.objects?.length) return [];
      allData.push(...response.data.objects);

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
                  console.error(`Page ${page + i} fetch error:`, err.message);
                  return [];
                });

            pagePromises.push(this._requestQueue.add(pageTask));
          }
          const pageResults = await Promise.all(pagePromises);
          pageResults.forEach((pageData) => {
            if (pageData.length > 0) {
              allData.push(...pageData);
            }
          });
          if (allData.length >= maxRecords) {

            break;
          }
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
      console.error(`Failed to fetch ${type} data:`, error.message);
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
        "minor_person_types",
        "high_quality_image_url",
        "image_url",
      ],
      bills: ["id", "title", "bill_type", "introduced_date"],
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
          const fileName = imageDownloader.generateFileName('senator', item.id, imageUrl);
          photoPath = await imageDownloader.downloadImage(imageUrl, 'senator', fileName);
        } catch (error) {
          console.error(`Failed to download image for senator ${item.id}:`, error.message);
          photoPath = null;
        }
      }
 
      return {
        senatorId: item.id,
        name: `Sen. ${item.firstname || ""} ${item.middlename || ""} ${item.lastname || ""}`.trim(),
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
          const fileName = imageDownloader.generateFileName('representative', item.id, imageUrl);
          photoPath = await imageDownloader.downloadImage(imageUrl, 'representative', fileName);
        } catch (error) {
          console.error(`Failed to download image for rep ${item.id}:`, error.message);
          photoPath = null;
        }
      }
 
      return {
        repId: item.id,
        name: `Rep. ${item.firstname || ""} ${item.middlename || ""} ${item.lastname || ""}`.trim(),
        party: partyMap[item.most_recent_party] || "Unknown",
        photo: photoPath,
        district: formatDistrict(
          districtMap[item.most_recent_district] || "Unknown"
        ),
      };
    }
    return null;
  },
      bills: (item) => ({
        quorumId: item.id,
        title: item.title || "Unknown",
        type: item.bill_type || "Unknown",
        date: item.introduced_date || "Unknown",
      }),
    };
 
    const BATCH_SIZE = 250;
    const filtered = [];
 
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE);
     
      const batchPromises = batch.map(mappings[type]);
      const batchResult = await Promise.all(batchPromises);
     
      filtered.push(...batchResult.filter(Boolean));
     
      if (data.length > 500 && i % 500 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
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
        await model.updateOne(
          { [idField]: bill[idField] },
          { $setOnInsert: bill }, 
          { upsert: true }
        );
        return model.findOne({ [idField]: bill[idField] });
      });

      const saved = await Promise.all(savedPromises);

      res.json({
        message:
          "Bills saved. Cosponsorship & vote updates running in background.",
        data: saved,
      });
      (async () => {
        try {
          await this.updateBillShortDesc(saved);

          const CHUNK_SIZE = cacheConfig.BATCH_SIZES.VOTE_UPDATES;
          for (let i = 0; i < saved.length; i += CHUNK_SIZE) {
            const chunk = saved.slice(i, i + CHUNK_SIZE);
            await Promise.all(
              chunk.map((bill) => this.updateVoteScore(bill.quorumId, editorInfo))
            );
          }

          for (const bill of saved) {
            try {

              const introduced = bill.date
                ? new Date(bill.date).toISOString()
                : new Date().toISOString();

              await ActivityController.fetchAndCreateFromCosponsorships(
                String(bill.quorumId),
                String(bill.title || "Untitled Bill"),
                introduced,
                bill.congress,
                editorInfo
              );
            } catch (err) {
              console.warn(
                ` Cosponsorship fetch failed for ${bill.quorumId}:`,
                err.message
              );
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

  async updateVoteScore(quorumId, editorInfo) {
    try {
      const editorData = editorInfo || {
        editorId: "system-auto",
        editorName: "System Auto-Update",
        editedAt: new Date().toISOString()
      };

      const fetchTask = () =>
        apiClient.get(process.env.VOTE_API_URL, {
          params: {
            api_key: process.env.QUORUM_API_KEY,
            username: process.env.QUORUM_USERNAME,
            related_bill: quorumId,
            limit: 2,
          },
        });

      const response = await this._requestQueue.add(fetchTask);
      const data = response.data?.objects?.[0];
      if (!data) return;

      const vote = await Bill.findOne({ quorumId });
      if (!vote) return;
      const billInfo = {
        quorumId: vote.quorumId,
        title: vote.title,
        congress: vote.congress,
        termId: vote.termId,
        type: vote.type
      };
      const { bill_type } = data.related_bill || {};
      const voteConfigs = [
        {
          personModel: Senator,
          dataModel: SenatorData,
          idField: "senateId",
          refField: "senatorId",
          type: "Senator"
        },
        {
          personModel: Representative,
          dataModel: RepresentativeData,
          idField: "houseId",
          refField: "repId",
          type: "Representative"
        }
      ];

      const votes = ["yea", "nay", "present", "other"];
      const voteUris = votes.flatMap((score) => data[`${score}_votes`] || []);
      const personIds = voteUris
        .map((uri) => uri?.replace(/\/$/, "").split("/").pop())
        .filter(Boolean);

      if (!personIds.length) return;
      for (const voteConfig of voteConfigs) {
        const { personModel, dataModel, idField, refField, type } = voteConfig;

        const persons = await personModel.find({
          [refField]: { $in: personIds },
        });
        if (!persons.length) continue; 
        const personMap = Object.fromEntries(persons.map((p) => [p[refField], p]));
        const updates = [];
        for (const score of votes) {
          const uris = data[`${score}_votes`] || [];
          for (const uri of uris) {
            const personId = uri?.replace(/\/$/, "").split("/").pop();
            const person = personMap[personId];
            if (!person) continue;

            updates.push({
              filter: {
                [idField]: person._id,
                "votesScore.voteId": { $ne: vote._id },
              },
              update: {
                $push: {
                  votesScore: {
                    voteId: vote._id,
                    score,
                    billInfo: {
                      quorumId: billInfo.quorumId,
                      title: billInfo.title,
                      congress: billInfo.congress,
                      termId: billInfo.termId,
                      type: billInfo.type,
                      voteDate: new Date().toISOString()
                    }
                  }
                }
              },
              personData: person,
              voteScore: score,
              billInfo: billInfo
            });
          }
        }

        const BATCH_SIZE = 50;
        for (let i = 0; i < updates.length; i += BATCH_SIZE) {
          const batch = updates.slice(i, i + BATCH_SIZE);

          await Promise.allSettled(
            batch.map(async (update) => {
              try {
                if (update.personData.publishStatus === "published") {
                  try {
                    const currentPerson = await personModel.findById(update.personData._id);
                    if (currentPerson && currentPerson.publishStatus === "published") {
                      if (Array.isArray(currentPerson.history) && currentPerson.history.length > 0) {
                      } else {
                        const currentPersonData = await dataModel.find({
                          [idField]: update.personData._id
                        });

                        const snapshotData = {
                          [refField]: currentPerson[refField],
                          name: currentPerson.name,
                          party: currentPerson.party,
                          photo: currentPerson.photo,
                          editedFields: currentPerson.editedFields || [],
                          fieldEditors: currentPerson.fieldEditors || {},
                          modifiedAt: currentPerson.modifiedAt,
                          modifiedBy: currentPerson.modifiedBy,
                          publishStatus: currentPerson.publishStatus,
                          snapshotSource: currentPerson.snapshotSource,
                          status: currentPerson.status
                        };
                        if (type === "Representative" && currentPerson.district) {
                          snapshotData.district = currentPerson.district;
                        }
                        if (type === "Representative") {
                          snapshotData.representativeData = currentPersonData.map(doc => doc.toObject());
                        } else if (type === "Senator") {
                          snapshotData.senatorData = currentPersonData.map(doc => doc.toObject());
                        }

                        const snapshot = {
                          oldData: snapshotData,
                          timestamp: new Date().toISOString(),
                          actionType: "update",
                          _id: new mongoose.Types.ObjectId()
                        };
                        await personModel.findByIdAndUpdate(
                          update.personData._id,
                          {
                            $push: {
                              history: {
                                $each: [snapshot],
                                $slice: -50
                              }
                            }
                          },
                          { new: true }
                        );
                      }
                    }
                  } catch (snapshotError) {
                    console.error(` Failed to take snapshot for ${update.personData.name}:`, snapshotError.message);
                  }
                }
                await dataModel.updateOne(update.filter, update.update, { upsert: true });
                if (type === "Senator" || type === "Representative") {
                  const editedFieldEntry = {
                    field: "votesScore",
                    name: `${update.billInfo.title}`,
                    fromQuorum: true,
                    updatedAt: new Date().toISOString()
                  };
                  const normalizedTitle = update.billInfo.title
                    .replace(/[^a-zA-Z0-9]+/g, "_")
                    .replace(/^_+|_+$/g, "");
                  const fieldKey = `votesScore_${normalizedTitle}`;
                  const personUpdatePayload = {
                    $push: {
                      editedFields: {
                        $each: [editedFieldEntry],
                        $slice: -20,
                      },
                    },
                    $set: {
                      updatedAt: new Date(),
                      modifiedAt: new Date(),
                      publishStatus: "under review",
                      snapshotSource: "edited",
                      [`fieldEditors.${fieldKey}`]: {
                        editorId: editorData.editorId,
                        editorName: editorData.editorName,
                        editedAt: editorData.editedAt,
                      },
                    },
                  };
                  await personModel.findByIdAndUpdate(
                    update.personData._id,
                    personUpdatePayload,
                    {
                      new: true,

                    }
                  );
                }
              } catch (error) {
                console.error(` Failed to update ${type} ${update.personData.name}:`, error.message);
              }
            })
          );
        }
      }
      } catch (err) {
        console.error(` Vote score update failed for bill ${quorumId}:`, err.message);
        console.error("Error stack:", err.stack);
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
