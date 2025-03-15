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
        this.saveVotes = this.saveVotes.bind(this);
    }

    static API_URLS = {
        senator: process.env.QUORUM_SENATOR_API || "https://www.quorum.us/api/newperson/",
        representative: process.env.QUORUM_REP_API || "https://www.quorum.us/api/newperson/",
        votes: process.env.VOTE_API_URL || "https://www.quorum.us/api/newbill/"
    };

    static MODELS = {
        senator: { model: Senator, idField: "senatorId" },
        representative: { model: Representative, idField: "repId" },
        votes: { model: Vote, idField: "quorumId" }
    };

    async fetchData(type, additionalParams = {}) {
        if (!QuorumDataController.API_URLS[type]) {
            throw new Error(`Invalid API type: ${type}`);
        }
        
        let allData = [];
        let offset = 0;
        const limit = 200;
        const maxRecords = 1000;
        
        try {
            while (allData.length < maxRecords) {
                const params = {
                    api_key: process.env.QUORUM_API_KEY,
                    username: process.env.QUORUM_USERNAME,
                    limit,
                    offset,
                    ...additionalParams
                };
                
                if (type === "senator") {
                    params.current = true;
                }
                
                const response = await axios.get(QuorumDataController.API_URLS[type], { params });
                if (!response.data || !Array.isArray(response.data.objects)) break;
                
                allData = allData.concat(response.data.objects);
                offset += limit;
                
                if (!response.data.meta?.next) break;
            }
        } catch (error) {
            console.error(`Error fetching ${type} data:`, error.stack || error.message);
        }
        
        return allData.slice(0, maxRecords);
    }

    filterData(type, data) {
        const partyMapping = { 1: "democrat", 2: "republican", 3: "independent" };
        
        const mapSenator = item => item?.title === "US Senator" ? {
            senatorId: item.id || null,
            name: `Sen.${item.firstname || "Unknown"} ${item.middlename || ""} ${item.lastname || "Unknown"}`.trim(),
            party: partyMapping[item.most_recent_party] || "Unknown",
            photo: item.high_quality_image_url || item.image_url || null,
            state: item.most_recent_role_state || "Unknown"
        } : null;
        
        const mapRepresentative = item => (Array.isArray(item.minor_person_types) && item.minor_person_types.includes(2) && item?.title === "US Representative") ? {
            repId: item.id || null,
            name: `Rep.${item.firstname || "Unknown"} ${item.middlename || ""} ${item.lastname || "Unknown"}`.trim(),
            photo: item.high_quality_image_url || item.image_url || null,
            district: item.most_recent_district || "Unknown",
            party: partyMapping[item.most_recent_party] || "Unknown",
            state: item.most_recent_role_state || "Unknown"
        } : null;
        
        const mapVotes = item => ({
            quorumId: item.id || null,
            title: item.title || "Unknown",
            type: item.bill_type || "Unknown",
            bill: item.bill || "Unknown",
            decision: item.decision || "Unknown"
        });
        
        const mappings = { senator: mapSenator, representative: mapRepresentative, votes: mapVotes };
        return data.map(mappings[type]).filter(Boolean);
    }

    async saveData(req, res) {
        try {
            const { type, additionalParams } = req.body;
            if (!QuorumDataController.MODELS[type]) return res.status(400).json({ error: "Invalid data type" });
            
            const rawData = await this.fetchData(type, additionalParams);
            if (!rawData.length) return res.status(400).json({ error: `No valid ${type} data to save` });
            
            const filteredData = this.filterData(type, rawData);
            if (!filteredData.length) return res.status(400).json({ error: `Filtered ${type} data is empty` });
            
            if (type === "votes") return res.json({ message: "Votes data fetched successfully", data: filteredData });
            
            const { model, idField } = QuorumDataController.MODELS[type];
            await model.bulkWrite(filteredData.map(item => ({
                updateOne: { filter: { [idField]: item[idField] }, update: { $set: item }, upsert: true }
            })));
            
            res.json({ message: `${type} data saved successfully` });
        } catch (error) {
            console.error(`Error storing ${req.body.type} data:`, error.stack || error.message);
            res.status(500).json({ error: `Failed to store ${req.body.type} data` });
        }
    }

    async saveVotes(req, res) {
        try {
            const { votes } = req.body;
            if (!Array.isArray(votes) || votes.length === 0) return res.status(400).json({ error: "No valid votes provided" });

            const { model, idField } = QuorumDataController.MODELS.votes;

            // Save each vote individually
            for (const vote of votes) {
                await model.updateOne({ [idField]: vote[idField] }, { $set: vote }, { upsert: true });
            }

            res.json({ message: "Votes saved successfully", data: votes });
        } catch (error) {
            console.error("Error saving votes:", error.stack || error.message);
            res.status(500).json({ error: "Failed to store votes" });
        }
    }
}

module.exports = new QuorumDataController();
