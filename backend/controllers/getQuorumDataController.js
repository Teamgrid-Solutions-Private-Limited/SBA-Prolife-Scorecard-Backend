require("dotenv").config();
const axios = require("axios");

const Senator = require("../models/senatorSchema");
const Representative = require("../models/representativeSchema");
const Bill = require("../models/voteSchema");
const SenatorData = require("../models/senatorDataSchema");
const RepresentativeData = require("../models/representativeDataSchema");

class QuorumDataController {
    constructor() {
        this.saveData = this.saveData.bind(this);
        this.saveBills = this.saveBills.bind(this);
        this.updateVoteScore = this.updateVoteScore.bind(this);
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

    // Generic API Fetcher
    async fetchFromApi(url, params) {
        const response = await axios.get(url, { params });
        if (!response.data || !Array.isArray(response.data.objects)) return [];
        return response.data.objects;
    }

    async fetchStateData() {
        const params = {
            api_key: process.env.QUORUM_API_KEY,
            username: process.env.QUORUM_USERNAME,
            limit: 400
        };
        const data = await this.fetchFromApi("https://www.quorum.us/api/state/", params);
        return Object.fromEntries(data.map(state => [state.resource_uri, state.name]));
    }

    async fetchDistrictData() {
        const params = {
            api_key: process.env.QUORUM_API_KEY,
            username: process.env.QUORUM_USERNAME,
            limit: 1000
        };
        const data = await this.fetchFromApi("https://www.quorum.us/api/district/", params);
        return Object.fromEntries(data.map(d => [d.resource_uri, d.name]));
    }

    async fetchData(type, additionalParams = {}) {
        if (!QuorumDataController.API_URLS[type]) throw new Error(`Invalid API type: ${type}`);

        const allData = [];
        let offset = 0;
        const limit = { senator: 120, representative: 500, bills: 20 }[type] || 20;
        const maxRecords = type === "bills" ? 20 : 1000;

        while (allData.length < maxRecords) {
            const params = {
                api_key: process.env.QUORUM_API_KEY,
                username: process.env.QUORUM_USERNAME,
                limit,
                offset,
                ...additionalParams,
                ...(type === "senator" && { current: true })
            };

            const response = await axios.get(QuorumDataController.API_URLS[type], { params });
            if (!response.data?.objects?.length) break;

            allData.push(...response.data.objects);
            offset += limit;

            if (!response.data.meta?.next || type === "bills") break;
        }

        return allData.slice(0, maxRecords);
    }

    async filterData(type, data) {
        const partyMap = { 1: "democrat", 2: "republican", 3: "independent" };
        const stateMap = await this.fetchStateData();
        const districtMap = await this.fetchDistrictData();

        const mappings = {
            senator: item => item.title === "US Senator" ? {
                senatorId: item.id,
                name: `Sen.${item.firstname || ""} ${item.middlename || ""} ${item.lastname || ""}`.trim(),
                party: partyMap[item.most_recent_party] || "Unknown",
                photo: item.high_quality_image_url || item.image_url || null,
                state: stateMap[item.most_recent_state] || "Unknown"
            } : null,

            representative: item => (item.minor_person_types?.includes(2) && item.title === "US Representative") ? {
                repId: item.id,
                name: `Rep.${item.firstname || ""} ${item.middlename || ""} ${item.lastname || ""}`.trim(),
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

            const rawData = await this.fetchData(type, additionalParams);
            if (!rawData.length) return res.status(400).json({ error: `No valid ${type} data` });

            const filtered = await this.filterData(type, rawData);
            if (!filtered.length) return res.status(400).json({ error: `Filtered ${type} data is empty` });

            if (type === "bills") return res.json({ message: "Bills fetched", data: filtered });

            const { model, idField } = modelConfig;
            await model.bulkWrite(filtered.map(item => ({
                updateOne: {
                    filter: { [idField]: item[idField] },
                    update: { $set: item },
                    upsert: true
                }
            })));

            res.json({ message: `${type} data saved successfully` });
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

            const saved = await Promise.all(
                bills.map(async bill => {
                    await model.updateOne({ [idField]: bill[idField] }, { $set: bill }, { upsert: true });
                    return model.findOne({ [idField]: bill[idField] });
                })
            );

            await this.updateBillShortDesc(saved);
            await Promise.all(saved.map(bill => this.updateVoteScore(bill.quorumId)));

            res.json({ message: "Bills saved & scores updated", data: saved });
        } catch (err) {
            console.error("Save bills error:", err);
            res.status(500).json({ error: "Failed to store bills" });
        }
    }

    async updateBillShortDesc(bills) {
        const { model, idField } = QuorumDataController.MODELS.bills;

        await Promise.all(bills.map(async bill => {
            try {
                const { data } = await axios.get(`https://www.quorum.us/api/newbillsummary/${bill[idField]}/`, {
                    params: {
                        api_key: process.env.QUORUM_API_KEY,
                        username: process.env.QUORUM_USERNAME,
                        limit: 1
                    }
                });
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

    async updateVoteScore(quorumId) {
        try {
            const response = await axios.get(process.env.VOTE_API_URL, {
                params: {
                    api_key: process.env.QUORUM_API_KEY,
                    username: process.env.QUORUM_USERNAME,
                    related_bill: quorumId,
                    limit: 2
                }
            });

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

            for (const score of votes) {
                const uris = data[`${score}_votes`] || [];
                await Promise.all(uris.map(async uri => {
                    const personId = uri?.replace(/\/$/, "").split("/").pop();
                    const person = await personModel.findOne({ [voteConfig.refField]: personId });
                    if (!person) return;

                    const query = { [idField]: person._id };
                    const exists = await dataModel.exists({ ...query, "votesScore.voteId": vote._id });
                    if (exists) return;

                    await dataModel.updateOne(
                        query,
                        { $push: { votesScore: { voteId: vote._id, score } } },
                        { upsert: true }
                    );
                }));
            }
        } catch (err) {
            console.error("Vote score update failed:", err.message);
        }
    }
}

module.exports = new QuorumDataController();
