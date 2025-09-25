 const mongoose = require('mongoose');

const RepresentativeDataSchema = new mongoose.Schema({
    houseId: { type: mongoose.Schema.Types.ObjectId, ref: 'representatives' },
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
RepresentativeDataSchema.index(
  { houseId: 1,  currentTerm: 1 },
  { unique: true, partialFilterExpression: { currentTerm: true } }
);
module.exports = mongoose.model('representative_datas', RepresentativeDataSchema);
