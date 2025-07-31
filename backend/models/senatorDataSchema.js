const mongoose = require('mongoose');
const applyChangeLogger = require('../utils/logChange');

const SenatorDataSchema = new mongoose.Schema({
  senateId: { type: mongoose.Schema.Types.ObjectId, ref: 'senators' },
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'terms' },
  currentTerm: Boolean,
  summary: String,
  rating: String,
  votesScore: [
    { 
      voteId: { type: mongoose.Schema.Types.ObjectId, ref: 'votes' },  
      score: String 
    }
  ],
  activitiesScore: [
    { 
      activityId: { type: mongoose.Schema.Types.ObjectId, ref: 'activities' },  
      score: String 
    }
  ]
},{timestamps: true});


SenatorDataSchema.index({ senateId: 1, currentTerm: 1 });
// Attach middleware
applyChangeLogger(SenatorDataSchema, "senator_datas");

module.exports = mongoose.model('senator_datas', SenatorDataSchema);