require("dotenv").config();
const cacheConfig = require("../config/cache-config");
const Bill = require("../models/voteSchema");

/**
 * Updates roll call (source link) for bills by fetching vote data from Quorum API
 * @param {Array} bills - Array of bill objects to update
 * @param {Object} apiClient - Axios client instance for API requests
 * @param {Object} requestQueue - Request queue instance for rate limiting
 */
async function updateBillRollCall(bills, apiClient, requestQueue) {
  const idField = "quorumId";
  const BATCH_SIZE = cacheConfig.BATCH_SIZES.BILL_UPDATES || 10;

  console.log(
    `📋 [ROLLCALL] Starting to fetch source links for ${bills.length} bills`
  );

  for (let i = 0; i < bills.length; i += BATCH_SIZE) {
    const batch = bills.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (bill) => {
        try {
          console.log(
            `🔗 [ROLLCALL] Fetching source link for bill ${bill[idField]}`
          );

          const fetchTask = () =>
            apiClient.get(process.env.VOTE_API_URL, {
              params: {
                api_key: process.env.QUORUM_API_KEY,
                username: process.env.QUORUM_USERNAME,
                id: bill[idField],
                region: "federal",
              },
            });

          const response = await requestQueue.add(fetchTask);
          const voteData = response.data?.objects?.[0];

          if (voteData && voteData.source_link) {
            console.log(
              `✅ [ROLLCALL] Found source link: ${voteData.source_link}`
            );

            await Bill.updateOne(
              { [idField]: bill[idField] },
              { $set: { rollCall: voteData.source_link } }
            );

            console.log(
              `💾 [ROLLCALL] Saved source link for bill ${bill[idField]}`
            );
          } else {
            console.warn(
              `⚠️  [ROLLCALL] No source link found for bill ${bill[idField]}`
            );
          }
        } catch (err) {
          if (err.response?.status === 404) {
            console.warn(
              `⚠️  [ROLLCALL] Vote data not found for bill ${bill[idField]}`
            );
          } else {
            console.error(
              `❌ [ROLLCALL] Error fetching source link for bill ${bill[idField]}:`,
              err.message
            );
          }
        }
      })
    );
  }
}

module.exports = { updateBillRollCall };

