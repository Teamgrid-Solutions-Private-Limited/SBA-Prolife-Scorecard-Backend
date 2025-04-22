const mongoose=require('mongoose');
const RepresentativeDataSchema = new mongoose.Schema({
    houseId: { type: mongoose.Schema.Types.ObjectId, ref: 'representatives' },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'terms' },
    currentTerm: Boolean,
    summary: String,
    rating: String,
    votesScore: [{ voteId: mongoose.Schema.Types.ObjectId, score: String }],
    activitiesScore: [{ activityId: mongoose.Schema.Types.ObjectId, score: String }]
  });
  
  module.exports=mongoose.model('representative_datas', RepresentativeDataSchema);