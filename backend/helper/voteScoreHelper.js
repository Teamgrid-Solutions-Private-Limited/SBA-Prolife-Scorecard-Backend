require("dotenv").config();
const mongoose = require("mongoose");

/**
 * Updates vote scores for senators and representatives based on vote data from Quorum API
 * @param {string} quorumId - The Quorum ID of the bill/vote to update
 * @param {Object} editorInfo - Information about who is making the edit
 * @param {Object} apiClient - Axios client instance for API requests
 * @param {Object} requestQueue - Request queue instance for rate limiting
 * @param {Object} models - Object containing all required models
 * @param {Object} models.Bill - Bill model
 * @param {Object} models.Senator - Senator model
 * @param {Object} models.Representative - Representative model
 * @param {Object} models.SenatorData - SenatorData model
 * @param {Object} models.RepresentativeData - RepresentativeData model
 */
async function updateVoteScore(quorumId, editorInfo, apiClient, requestQueue, models) {
  try {
    const { Bill, Senator, Representative, SenatorData, RepresentativeData } = models;

    const editorData = editorInfo || {
      editorId: "system-auto",
      editorName: "System Auto-Update",
      editedAt: new Date().toISOString(),
    };

    const fetchTask = () =>
      apiClient.get(process.env.VOTE_API_URL, {
        params: {
          api_key: process.env.QUORUM_API_KEY,
          username: process.env.QUORUM_USERNAME,
          id: quorumId,
          region: "federal",
          // limit: 50,
        },
      });

    const response = await requestQueue.add(fetchTask);
    const data = response.data?.objects?.[0];
    if (!data) return;

    const vote = await Bill.findOne({ quorumId });
    if (!vote) return;
    const billInfo = {
      id: vote.quorumId,
      title: vote.title,
      congress: vote.congress,
      termId: vote.termId,
      type: vote.type,
    };
    const { bill_type } = data.related_bill || {};
    const voteConfigs = [
      {
        personModel: Senator,
        dataModel: SenatorData,
        idField: "senateId",
        refField: "senatorId",
        type: "Senator",
      },
      {
        personModel: Representative,
        dataModel: RepresentativeData,
        idField: "houseId",
        refField: "repId",
        type: "Representative",
      },
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
      const personMap = Object.fromEntries(
        persons.map((p) => [p[refField], p])
      );
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
                    voteDate: new Date().toISOString(),
                  },
                },
              },
            },
            personData: person,
            voteScore: score,
            billInfo: billInfo,
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
                  const currentPerson = await personModel.findById(
                    update.personData._id
                  );
                  if (
                    currentPerson &&
                    currentPerson.publishStatus === "published"
                  ) {
                    if (
                      Array.isArray(currentPerson.history) &&
                      currentPerson.history.length > 0
                    ) {
                    } else {
                      const currentPersonData = await dataModel.find({
                        [idField]: update.personData._id,
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
                        status: currentPerson.status,
                      };
                      if (
                        type === "Representative" &&
                        currentPerson.district
                      ) {
                        snapshotData.district = currentPerson.district;
                      }
                      if (type === "Representative") {
                        snapshotData.representativeData =
                          currentPersonData.map((doc) => doc.toObject());
                      } else if (type === "Senator") {
                        snapshotData.senatorData = currentPersonData.map(
                          (doc) => doc.toObject()
                        );
                      }

                      const snapshot = {
                        oldData: snapshotData,
                        timestamp: new Date().toISOString(),
                        actionType: "update",
                        _id: new mongoose.Types.ObjectId(),
                      };
                      await personModel.findByIdAndUpdate(
                        update.personData._id,
                        {
                          $push: {
                            history: {
                              $each: [snapshot],
                              $slice: -50,
                            },
                          },
                        },
                        { new: true }
                      );
                    }
                  }
                } catch (snapshotError) {
                  console.error(
                    ` Failed to take snapshot for ${update.personData.name}:`,
                    snapshotError.message
                  );
                }
              }
              await dataModel.updateOne(update.filter, update.update, {
                upsert: true,
              });
              if (type === "Senator" || type === "Representative") {
                const editedFieldEntry = {
                  field: "votesScore",
                  name: `${update.billInfo.title}`,
                  fromQuorum: true,
                  updatedAt: new Date().toISOString(),
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
              console.error(
                ` Failed to update ${type} ${update.personData.name}:`,
                error.message
              );
            }
          })
        );
      }
    }
  } catch (err) {
    console.error(
      ` Vote score update failed for bill ${quorumId}:`,
      err.message
    );
    console.error("Error stack:", err.stack);
  }
}

module.exports = { updateVoteScore };

