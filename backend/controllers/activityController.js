const Activity = require("../models/activitySchema");
const upload = require("../middlewares/fileUploads");
class activityController {
  // Create a new activity with file upload for readMore
  static async createActivity(req, res) {
    // Use multer to handle the file upload
    upload.single("readMore")(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }

      try {
        // Extract other fields from the body
        const {
          type,
          title,
          shortDesc,
          longDesc,
          rollCall,
          date,
          congress,
          termId,
          trackActivities,
        } = req.body;

        // Get the uploaded file path (null if no file is uploaded)
        const readMore = req.file
          ? `/uploads/documents/${req.file.filename}`
          : null;

        // Create a new vote document
        const newActivity = new Activity({
          type,
          title,
          shortDesc,
          longDesc,
          rollCall,
          readMore, // Attach the file path if a file is uploaded
          date,
          congress,
          termId,
          trackActivities, // Default status
          status: "draft",
        });

        // Save the new vote to the database
        await newActivity.save();

        // Send a successful response with the created vote data
        res
          .status(201)
          .json({
            message: "Activity created successfully",
            info: newActivity,
          });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Error creating Activity", error: error.message });
      }
    });
  }

  // Get all votes with populated termId
  static async getAllActivity(req, res) {
    try {
      const activity = await Activity.find().populate("termId");
      res.status(200).json(activity);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving activity", error });
    }
  }

  // Get a vote by ID with populated termId
  static async getActivityById(req, res) {
    try {
      const activity = await Activity.findById(req.params.id).populate(
        "termId"
      );
      if (!activity) {
        return res.status(404).json({ message: "activity not found" });
      }
      res.status(200).json(activity);
    } catch (error) {
      res.status(500).json({ message: "Error retrieving activity", error });
    }
  }

  // Update a vote by ID
  static async updateActivity(req, res) {
    try {
      // Use multer to handle file upload
      upload.single("readMore")(req, res, async (err) => {
        if (err) {
          return res.status(400).json({ message: err.message });
        }

        const activityID = req.params.id;
        let updateData = { ...req.body }; // Capture other fields from the request

        // If a new file is uploaded for 'readMore', save the file path
        if (req.file) {
          updateData.readMore = `/uploads/${req.file.filename}`;
        }

        // Update the vote in the database
        const updatedActivity = await Activity.findByIdAndUpdate(
          activityID,
          updateData,
          { new: true }
        ).populate("termId"); // Populate the referenced term (optional)

        if (!updatedActivity) {
          return res.status(404).json({ message: "Activity not found" });
        }

        // Send the updated vote in the response
        res
          .status(200)
          .json({
            message: "Activity updated successfully",
            info: updatedActivity,
          });
      });
    } catch (error) {
      res.status(500).json({ message: "Error updating Activity", error });
    }
  }

  // Delete a vote by ID
  static async deleteActivity(req, res) {
    try {
      const deletedActivity = await Activity.findByIdAndDelete(req.params.id);

      if (!deletedActivity) {
        return res.status(404).json({ message: "activity not found" });
      }

      res.status(200).json({ message: "activity deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting activity", error });
    }
  }

  static async updateActivityStatus(req, res) {
    try {
      const { status } = req.body;
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ message: "Missing activity ID" });
      }

      if (!["draft", "published", "reviewed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updatedActivity = await Activity.findByIdAndUpdate(
        id,
        { status },
        { new: true, runValidators: true }
      );

      if (!updatedActivity) {
        return res.status(404).json({ message: "Activity not found" });
      }

      return res.status(200).json({
        message: "Status updated successfully",
        activity: updatedActivity,
      });
    } catch (error) {
      return res.status(500).json({
        message: "Error updating activity status",
        error: error.message,
      });
    }
  }

  // Controller to bulk PATCH trackActivities
static async bulkUpdateTrackActivities(req, res) {
  try {
    const { ids, trackActivities } = req.body;

    // Validate input
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'No activity IDs provided' });
    }

    const validStatuses = ['pending', 'completed', 'failed'];
    if (!validStatuses.includes(trackActivities)) {
      return res.status(400).json({ message: 'Invalid trackActivities value' });
    }

    // Bulk update
    const result = await Activity.updateMany(
      { _id: { $in: ids } },
      { $set: { trackActivities } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: 'No activities were updated' });
    }

    const updatedActivities = await Activity.find({ _id: { $in: ids } });

    res.status(200).json({
      message: `${result.modifiedCount} activities updated successfully`,
      updatedActivities
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error bulk updating activities',
      error: error.message
    });
  }
  }
  

  static async saveSponsorActivities(personIds) {
    try {
      // 1. Fetch sponsor data from Quorum
      const sponsorsData = await this.fetchSponsorsFromQuorum(personIds);
      const savedActivities = [];

      // 2. Process each sponsor's data
      for (const sponsorData of sponsorsData) {
        // Check if legislator exists (both active and former)
        const senator = await Senator.findOne({
          senatorId: sponsorData.sponsorId,
          status: { $in: ["active", "former"] }
        });
        const representative = await Representative.findOne({
          repId: sponsorData.sponsorId,
          status: { $in: ["active", "former"] }
        });

        // Helper function to parse and validate date
        const parseDate = (dateStr) => {
          if (!dateStr) return null;
          const parsed = new Date(dateStr);
          return parsed instanceof Date && !isNaN(parsed) ? parsed : null;
        };

        if (!senator && !representative) {
          console.log(`No legislator found in database for sponsor ID: ${sponsorData.sponsorId}`);
          
          const parsedDate = parseDate(sponsorData.introducedDate) || new Date();
          
          // Create a placeholder activity for tracking
          const activityData = {
            type: sponsorData.billType?.toLowerCase().includes('house') ? 'house' : 'senate',
            title: sponsorData.billTitle,
            shortDesc: `${sponsorData.billLabel}: ${sponsorData.billTitle}`,
            longDesc: `Status: ${sponsorData.currentStatusText}\nLast Action: ${sponsorData.lastActionText}\nNote: Legislator not found in database`,
            date: parsedDate,
            congress: '',
            quorumId: sponsorData.billId,
            quorumSponsorId: sponsorData.sponsorId,
            trackActivities: 'pending',
            status: 'draft'
          };

          // Check if placeholder activity already exists
          const existingActivity = await Activity.findOne({
            quorumId: sponsorData.billId,
            quorumSponsorId: sponsorData.sponsorId
          });

          if (!existingActivity) {
            const newActivity = new Activity(activityData);
            await newActivity.save();
            savedActivities.push(newActivity);
            console.log(`Created placeholder activity for unknown legislator: ${sponsorData.sponsorId}`);
          }
          
          continue;
        }

        let legislatorStatus = "";
        if (senator) {
          legislatorStatus = `Senator (${senator.status}) - ${senator.name}`;
        } else if (representative) {
          legislatorStatus = `Representative (${representative.status}) - ${representative.name}`;
        }

        // Create activity document with correct enum values and legislator status
        const parsedDate = parseDate(sponsorData.introducedDate) || new Date();
        
        const activityData = {
          type: senator ? 'senate' : 'house',
          title: sponsorData.billTitle,
          shortDesc: `${sponsorData.billLabel}: ${sponsorData.billTitle}`,
          longDesc: `Status: ${sponsorData.currentStatusText}\nLast Action: ${sponsorData.lastActionText}\nLegislator: ${legislatorStatus}`,
          date: parsedDate,
          congress: '', // Current congress
          quorumId: sponsorData.billId,
          quorumSponsorId: sponsorData.sponsorId,
          trackActivities: 'pending', // Valid enum: ["completed", "pending", "failed"]
          status: 'draft'  // Valid enum: ["draft", "published", "reviewed"]
        };

        // Check if activity already exists
        const existingActivity = await Activity.findOne({
          quorumId: sponsorData.billId,
          quorumSponsorId: sponsorData.sponsorId
        });

        if (existingActivity) {
          console.log(`Activity already exists for bill ${sponsorData.billId} and sponsor ${sponsorData.sponsorId}`);
          savedActivities.push(existingActivity);
          continue;
        }

        // Find current term
        const currentTerm = await Term.findOne({
          congress: sponsorData.congress || '118',
          current: true
        });

        // Save new activity with term
        const newActivity = new Activity({
          ...activityData,
          termId: currentTerm?._id // Add termId to activity
        });
        await newActivity.save();
        savedActivities.push(newActivity);

        // Update legislator's tracked activities and scores
        try {
          if (senator) {
            if (!senator.trackedActivities) senator.trackedActivities = [];
            if (!senator.trackedActivities.includes(sponsorData.billTitle)) {
              senator.trackedActivities.push(sponsorData.billTitle);
              // Ensure correct status values
              if (!["active", "former"].includes(senator.status)) {
                senator.status = "active";
              }
              if (!["draft", "published", "reviewed"].includes(senator.publishStatus)) {
                senator.publishStatus = "draft";
              }
              await senator.save();
              console.log(`Updated tracked activities for ${legislatorStatus}`);

              // Update senator data with activity score
              await this.updateActivityScores(newActivity, senator, false);
            }
          } else if (representative) {
            if (!representative.trackedActivities) representative.trackedActivities = [];
            if (!representative.trackedActivities.includes(sponsorData.billTitle)) {
              representative.trackedActivities.push(sponsorData.billTitle);
              // Ensure correct status values
              if (!["active", "former"].includes(representative.status)) {
                representative.status = "active";
              }
              if (!["draft", "published", "reviewed"].includes(representative.publishStatus)) {
                representative.publishStatus = "draft";
              }
              await representative.save();
              console.log(`Updated tracked activities for ${legislatorStatus}`);

              // Update representative data with activity score
              await this.updateActivityScores(newActivity, representative, true);
            }
          }
        } catch (error) {
          console.error(`Error updating tracked activities for ${legislatorStatus}:`, error.message);
        }
      }

      return savedActivities;
    } catch (error) {
      console.error('Error saving sponsor activities:', error);
      throw error;
    }
  }

  // Helper method to update activity scores in legislator data
  static async updateActivityScores(activity, legislator, isRepresentative = false) {
    try {
      // Get current term
      const termId = activity.termId; // We'll need to set this when creating activity

      // Find or create legislator data for current term
      const DataModel = isRepresentative ? RepresentativeData : SenatorData;
      const idField = isRepresentative ? 'houseId' : 'senateId';
      
      let legislatorData = await DataModel.findOne({
        [idField]: legislator._id,
        termId: termId,
        currentTerm: true
      });

      if (!legislatorData) {
        legislatorData = new DataModel({
          [idField]: legislator._id,
          termId: termId,
          currentTerm: true,
          summary: '',
          rating: '',
          votesScore: [],
          activitiesScore: []
        });
      }

      // Check if activity score already exists
      const existingScoreIndex = legislatorData.activitiesScore.findIndex(
        score => score.activityId.toString() === activity._id.toString()
      );

      if (existingScoreIndex === -1) {
        // Add new activity score
        legislatorData.activitiesScore.push({
          activityId: activity._id,
          score: 'pending' // Default score, can be modified based on your requirements
        });
      }

      await legislatorData.save();
      console.log(`Updated ${isRepresentative ? 'representative' : 'senator'} data for ${legislator.name}`);
    } catch (error) {
      console.error('Error updating activity scores:', error);
      throw error;
    }
  }

  static async fetchSponsorsFromQuorum(personIds, limit = 100) {
    const sponsorData = [];
    const QUORUM_BASE_URL = 'https://www.quorum.us/api/newsponsor/';

    console.log('🔑 Checking environment variables:');
    console.log('API Key exists:', !!process.env.QUORUM_API_KEY);
    console.log('Username exists:', !!process.env.QUORUM_USERNAME);
    console.log('📥 Input personIds:', personIds);

    // Split into batches of 10
    const batchSize = 10;
    const chunks = [];
    for (let i = 0; i < personIds.length; i += batchSize) {
      chunks.push(personIds.slice(i, i + batchSize));
    }

    console.log(`🔄 Processing ${chunks.length} chunks of data`);

    for (const chunk of chunks) {
      const personParam = chunk.join(",");
      console.log(`\n📊 Processing chunk with persons: ${personParam}`);

      try {
        console.log('🌐 Making API request to:', QUORUM_BASE_URL);
        const requestParams = {
          api_key: process.env.QUORUM_API_KEY,
          username: process.env.QUORUM_USERNAME,
          person__in: personParam,
          sponsor_type__in: '1,2,3',
          congress__gte: '117',  // Include current and previous congress
          limit: limit,
          fields: 'id,person,bill,sponsor_name,bill_number,bill_title,introduced_date,sponsor_type,bill__number,bill__title,bill__introduced_date'
        };
        console.log('📝 Request params:', { ...requestParams, api_key: '[HIDDEN]' });

        const response = await axios.get(QUORUM_BASE_URL, {
          params: requestParams,
          timeout: 10000
        });

        console.log('✅ Response status:', response.status);
        console.log('📦 Response data objects:', response.data?.objects?.length || 0);

        if (response.status === 200 && response.data?.objects?.length) {
          console.log('🔍 First sponsor object structure:', JSON.stringify(response.data.objects[0], null, 2));
          
          // First pass: collect all unique bill IDs
          const billIds = new Set();
          const billDetails = new Map();
          
          response.data.objects.forEach(sponsor => {
            const billUrl = sponsor.bill;
            const billMatch = billUrl && typeof billUrl === 'string' ?
              billUrl.match(/\/api\/newbill\/(\d+)\//) : null;
            if (billMatch) {
              billIds.add(billMatch[1]);
            }
          });

          // Fetch bill details in parallel
          if (billIds.size > 0) {
            console.log(`🔄 Fetching details for ${billIds.size} bills`);
            const billPromises = Array.from(billIds).map(async (billId) => {
              try {
                const billResponse = await axios.get(`https://www.quorum.us/api/newbill/${billId}/`, {
                  params: {
                    api_key: process.env.QUORUM_API_KEY,
                    username: process.env.QUORUM_USERNAME,
                    fields: 'id,number,label,title,bill_type,introduced_date,current_status,current_status_text,last_action_text,num_democrat_cosponsors,num_republican_cosponsors,num_independent_cosponsors'
                  },
                  timeout: 10000
                });
                if (billResponse.data) {
                  console.log(`✅ Got details for bill ${billId}:`, billResponse.data);
                  billDetails.set(billId, billResponse.data);
                }
              } catch (error) {
                console.error(`❌ Error fetching bill ${billId}:`, error.message);
              }
              // Add a small delay between requests to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 100));
            });

            await Promise.all(billPromises);
          }

          // Second pass: create sponsor data with bill details
          response.data.objects.forEach(sponsor => {
            const personUrl = sponsor.person;
            const personMatch = personUrl && typeof personUrl === 'string' ?
              personUrl.match(/\/api\/newperson\/(\d+)\//) : null;
            const personId = personMatch ? personMatch[1] :
              (sponsor.person?.id || sponsor.person || null);

            const billUrl = sponsor.bill;
            const billMatch = billUrl && typeof billUrl === 'string' ?
              billUrl.match(/\/api\/newbill\/(\d+)\//) : null;
            const billId = billMatch ? billMatch[1] : null;
            
            const billDetail = billId ? billDetails.get(billId) : null;

            sponsorData.push({
              sponsorId: personId,
              sponsorName: sponsor.sponsor_name || 'Unknown Sponsor',
              billId: billId,
              billNumber: billDetail?.number || 'Unknown Bill Number',
              billLabel: billDetail?.label || '',  // e.g., "H.R. 5119"
              billTitle: billDetail?.title || "Unknown Title",
              billType: billDetail?.bill_type || '',  // e.g., "house_bill"
              introducedDate: billDetail?.introduced_date || "Unknown Date",
              currentStatus: billDetail?.current_status || '',  // e.g., "referred"
              currentStatusText: billDetail?.current_status_text || '',  // e.g., "Referred to Committee"
              lastActionText: billDetail?.last_action_text || '',
              numDemocratCosponsors: billDetail?.num_democrat_cosponsors || 0,
              numRepublicanCosponsors: billDetail?.num_republican_cosponsors || 0,
              numIndependentCosponsors: billDetail?.num_independent_cosponsors || 0,
              sponsorType: sponsor.sponsor_type || null
            });
          });
        } else {
          console.log('⚠️ No data in response:', response.data);
        }
      } catch (err) {
        console.error("❌ Error fetching chunk:", {
          chunk,
          status: err.response?.status,
          message: err.message,
          data: err.response?.data
        });
      }
    }

    return sponsorData;
  }

}

module.exports = activityController;
