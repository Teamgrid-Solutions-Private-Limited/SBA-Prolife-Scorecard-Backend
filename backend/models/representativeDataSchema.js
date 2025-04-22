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
});

module.exports = mongoose.model('representative_datas', RepresentativeDataSchema);