const mongoose = require('mongoose');

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
}, { timestamps: true });

// ✅ define indexes BEFORE exporting
SenatorDataSchema.index(
  { senateId: 1 },
  { unique: true, partialFilterExpression: { currentTerm: true } }
);

module.exports = mongoose.model('senator_datas', SenatorDataSchema);


