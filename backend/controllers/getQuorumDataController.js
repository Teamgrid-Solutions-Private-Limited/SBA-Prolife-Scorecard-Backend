 // Description: Controller for fetching and storing Quorum API
require("dotenv").config();
const axios = require("axios");
const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const Vote = require("../models/voteSchema");

class QuorumDataController {
    constructor() {
        this.fetchData = this.fetchData.bind(this);
        this.filterData = this.filterData.bind(this);
        this.saveData = this.saveData.bind(this);
    }

    static API_URLS = {
        senator: process.env.QUORUM_SENATOR_API || "https://www.quorum.us/api/newperson/",
        representative: process.env.QUORUM_REP_API || "https://www.quorum.us/api/newperson/",
        votes: process.env.VOTE_API_URL || "http://localhost:4000/dummy-data/votes"
    };

    static MODELS = {
        senator: { model: Senator, idField: "senatorId" },
        representative: { model: Representative, idField: "repId" },
        votes: { model: Vote, idField: "voteId" }
    };

    async fetchData(type) {
        try {
            if (!QuorumDataController.API_URLS[type]) {
                throw new Error(`Invalid API type: ${type}`);
            }
    
            let allData = [];
            let offset = 0;
            const limit = 200; // Set API fetch limit per request
            const maxRecords = 1000; // Maximum number of records to fetch
    
            while (true) {
                const params = {
                    api_key: process.env.QUORUM_API_KEY,
                    username: process.env.QUORUM_USERNAME,
                    limit,
                    offset
                };
    
                const response = await axios.get(QuorumDataController.API_URLS[type], { params });
    
                if (!response.data || !Array.isArray(response.data.objects)) {
                    console.error(`Invalid data format for ${type}`, response.data);
                    break;
                }
    
                allData = [...allData, ...response.data.objects]; // Append current batch
                offset += limit; // Increase offset for next batch
    
                if (allData.length >= maxRecords || !response.data.meta || !response.data.meta.next) break; // Stop if no more pages or maxRecords reached
            }
    
            // Trim the data to maxRecords if it exceeds
            if (allData.length > maxRecords) {
                allData = allData.slice(0, maxRecords);
            }
    
            return allData;
    
        } catch (error) {
            console.error(`Error fetching ${type} data:`, error.message);
            return [];
        }
    }

    // filterData(type, data) {
    //     const mappings = {
    //         senator: item => ({
    //             senatorId: item?.id || null,
    //             party: item?.most_recent_party || "Unknown",
    //             photo: item?.high_quality_image_url || item?.image_url || null,
    //             name: item?.name || "Unknown",
    //             state: item?.most_recent_role_state || "Unknown"
    //         }),
    //         representative: item => {
    //             if (
    //                 !Array.isArray(item.minor_person_types) || 
    //                 !item.minor_person_types.includes(2) || 
    //                 item?.most_recent_role_title !== "US Senator"
    //             ) {
    //                 return null;
    //             }
    //             return {
    //                 repId: item?.id || null,
    //                 name: item?.name || "Unknown",
    //                 title: item?.most_recent_role_title || "Unknown",
    //                 district: item?.most_recent_district || "Unknown",
    //                 party: item?.most_recent_party || "Unknown",
    //                 state: item?.most_recent_role_state || "Unknown"
    //             };
    //         },
    //         votes: item => ({
    //             voteId: item?._id || null,
    //             senatorId: item?.senatorId || null,
    //             repId: item?.repId || null,
    //             bill: item?.bill || "Unknown",
    //             decision: item?.decision || "Unknown"
    //         })
    //     };

    //     return data.map(mappings[type]).filter(item => item);
    // }

    filterData(type, data) {
        const mappings = {
            senator: item => {
                if (item?.title !== "US Senator") {
                    return null; // Skip if the title is not "US Senator"
                }
                return {
                    senatorId: item?.id || null,
                    name: item?.name || "Unknown",
                    
                    party: item?.most_recent_party || "Unknown",
                    photo: item?.high_quality_image_url || item?.image_url || null,
                    state: item?.most_recent_role_state || "Unknown"
                };
            },
            representative: item => {
                if (
                    !Array.isArray(item.minor_person_types) || 
                    !item.minor_person_types.includes(2) || 
                    item?.title !== "US Representative"
                ) {
                    return null; // Skip if title is not "US Representative"
                }
                return {
                    repId: item?.id || null,
                    name: item?.name || "Unknown",
                    photo: item?.high_quality_image_url || item?.image_url || null, 
                    district: item?.most_recent_district || "Unknown",
                    party: item?.most_recent_party || "Unknown",
                    state: item?.most_recent_role_state || "Unknown"
                };
            },
            votes: item => ({
                voteId: item?._id || null,
                senatorId: item?.senatorId || null,
                repId: item?.repId || null,
                bill: item?.bill || "Unknown",
                decision: item?.decision || "Unknown"
            })
        };
    
        return data.map(mappings[type]).filter(item => item);
    }
    

    async saveData(req, res) {
        try {
            const { type } = req.body;
            if (!QuorumDataController.MODELS[type]) {
                return res.status(400).json({ error: "Invalid data type" });
            }

            const rawData = await this.fetchData(type);
            if (!rawData.length) {
                return res.status(400).json({ error: `No valid ${type} data to save` });
            }

            const filteredData = this.filterData(type, rawData);
            if (!filteredData.length) {
                return res.status(400).json({ error: `Filtered ${type} data is empty` });
            }

            const { model, idField } = QuorumDataController.MODELS[type];

            const bulkOps = filteredData.map(item => ({
                updateOne: {
                    filter: { [idField]: item[idField] },
                    update: { $set: item },
                    upsert: true
                }
            }));

            await model.bulkWrite(bulkOps);
            res.json({ message: `${type} data saved successfully` });
        } catch (error) {
            console.error(`Error storing ${req.body.type} data:`, error.message);
            res.status(500).json({ error: `Failed to store ${req.body.type} data` });
        }
    }
}

module.exports = new QuorumDataController();
