require("dotenv").config();
const axios = require("axios");
const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const Bill = require("../models/voteSchema"); // Renamed Vote to Bill
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");

class QuorumDataController {
    constructor() {
        this.fetchData = this.fetchData.bind(this);
        this.filterData = this.filterData.bind(this);
        this.saveData = this.saveData.bind(this);
        this.saveBills = this.saveBills.bind(this); // Renamed saveVotes to saveBills
        this.updateVoteScore = this.updateVoteScore.bind(this);
    }

    static API_URLS = {
        senator: process.env.QUORUM_SENATOR_API || "https://www.quorum.us/api/newperson/",
        representative: process.env.QUORUM_REP_API || "https://www.quorum.us/api/newperson/",
        bills: process.env.BILL_API_URL || "https://www.quorum.us/api/newbill/" // Renamed votes to bills
    };

    static MODELS = {
        senator: { model: Senator, idField: "senatorId" },
        representative: { model: Representative, idField: "repId" },
        bills: { model: Bill, idField: "quorumId" } // Renamed votes to bills
    };

    async fetchStateData() {
        const params = {
            api_key: process.env.QUORUM_API_KEY,
            username: process.env.QUORUM_USERNAME,
            limit: 400
        };
        const response = await axios.get("https://www.quorum.us/api/state/", { params });
        if (!response.data || !Array.isArray(response.data.objects)) {
            throw new Error("Failed to fetch state data");
        }
        return response.data.objects.reduce((acc, state) => {
            acc[state.resource_uri] = state.name;
            return acc;
        }, {});
    }

    async fetchDistrictData() {
        const params = {
            api_key: process.env.QUORUM_API_KEY,
            username: process.env.QUORUM_USERNAME,
            limit: 1000
        };
        const response = await axios.get("https://www.quorum.us/api/district/", { params });
        if (!response.data || !Array.isArray(response.data.objects)) {
            throw new Error("Failed to fetch district data");
        }
        return response.data.objects.reduce((acc, district) => {
            acc[district.resource_uri] = district.name;
            return acc;
        }, {});
    }

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

    async filterData(type, data) {
        const partyMapping = { 1: "democrat", 2: "republican", 3: "independent" };
        const stateMapping = await this.fetchStateData();
        const districtMapping = await this.fetchDistrictData();

        const mapSenator = item => {
            const stateUri = item.most_recent_state;
            const stateName = stateMapping[stateUri] || "Unknown";
            return item?.title === "US Senator" ? {
                senatorId: item.id || null,
                name: `Sen.${item.firstname || "Unknown"} ${item.middlename || ""} ${item.lastname || "Unknown"}`.trim(),
                party: partyMapping[item.most_recent_party] || "Unknown",
                photo: item.high_quality_image_url || item.image_url || null,
                state: stateName
            } : null;
        };

        const mapRepresentative = item => {
            const districtUri = item.most_recent_district;
            const districtName = districtMapping[districtUri] || "Unknown";
            return (Array.isArray(item.minor_person_types) && item.minor_person_types.includes(2) && item?.title === "US Representative") ? {
                repId: item.id || null,
                name: `Rep.${item.firstname || "Unknown"} ${item.middlename || ""} ${item.lastname || "Unknown"}`.trim(),
                photo: item.high_quality_image_url || item.image_url || null,
                district: districtName,
                party: partyMapping[item.most_recent_party] || "Unknown",
            } : null;
        };

        const mapBills = async item => {
            const quorumId = item.id || null;
            const title = item.title || "Unknown";
            let shortDesc = "No description available";
            try {
                const response = await axios.get(`https://www.quorum.us/api/newbillsummary/${quorumId}/`, {
                    params: {
                        api_key: process.env.QUORUM_API_KEY,
                        username: process.env.QUORUM_USERNAME,
                        limit: 200
                    }
                });
           
                shortDesc = response.data.content || "No description available";
            } catch (error) {
                console.error(`Error fetching bill summary for quorumId ${quorumId}:`, error.message);
            }
            return { quorumId, shortDesc,title };
        };

        const mappings = { senator: mapSenator, representative: mapRepresentative, bills: mapBills }; // Renamed votes to bills
        const mappedData = await Promise.all(data.map(mappings[type])).then(results => results.filter(Boolean));

        return mappedData;
    }

    async saveData(req, res) {
        try {
            const { type, additionalParams } = req.body;
            if (!QuorumDataController.MODELS[type]) return res.status(400).json({ error: "Invalid data type" });
            
            const rawData = await this.fetchData(type, additionalParams);
            if (!rawData.length) return res.status(400).json({ error: `No valid ${type} data to save` });
            
            const filteredData = await this.filterData(type, rawData); // Await the filterData method
            if (!filteredData.length) return res.status(400).json({ error: `Filtered ${type} data is empty` });
            
            if (type === "bills") return res.json({ message: "Bills data fetched successfully", data: filteredData }); // Renamed votes to bills
            
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

    async saveBills(req, res) { // Renamed saveVotes to saveBills
        try {
            const { bills } = req.body; // Renamed votes to bills
            if (!Array.isArray(bills) || bills.length === 0) return res.status(400).json({ error: "No valid bills provided" }); // Renamed votes to bills

            const { model, idField } = QuorumDataController.MODELS.bills; // Renamed votes to bills

            // Save each bill individually
            for (const bill of bills) { // Renamed vote to bill
                await model.updateOne({ [idField]: bill[idField] }, { $set: bill }, { upsert: true }); // Renamed vote to bill
            }

            res.json({ message: "Bills saved successfully", data: bills }); // Renamed votes to bills
        } catch (error) {
            console.error("Error saving bills:", error.stack || error.message); // Renamed votes to bills
            res.status(500).json({ error: "Failed to store bills" }); // Renamed votes to bills
        }
    }

    async updateVoteScore(quorumId) {
        try {

            
            const voteDetails = await axios.get(`${process.env.VOTE_API_URL}/${quorumId}`);
            const { yea_votes, nay_votes, present_votes, other_votes, bill_type } = voteDetails.data;

            const allVotes = [
                ...yea_votes.map(uri => ({ uri, score: 'yea' })),
                ...nay_votes.map(uri => ({ uri, score: 'nay' })),
                ...present_votes.map(uri => ({ uri, score: 'present' })),
                ...other_votes.map(uri => ({ uri, score: 'other' }))
            ];

            for (const { uri, score } of allVotes) {
                const personId = uri.split('/').pop();
                let person;
                let dataModel;
                let idField;

                if (bill_type === 'senate_bill') {
                    person = await Senator.findOne({ quorumId: personId });
                    dataModel = SenatorData;
                    idField = 'senateId';
                } else if (bill_type === 'house_bill') {
                    person = await Representative.findOne({ quorumId: personId });
                    dataModel = RepresentativeData;
                    idField = 'houseId';
                }

                if (person) {
                    await dataModel.updateOne(
                        { [idField]: person._id },
                        { $push: { votesScore: { voteId: quorumId, score } } },
                        { upsert: true }
                    );
                }
            }
        } catch (error) {
            console.error("Error updating vote scores:", error.stack || error.message);
        }
    }
}

module.exports = new QuorumDataController();
