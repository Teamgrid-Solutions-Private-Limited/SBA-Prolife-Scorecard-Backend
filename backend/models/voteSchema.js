const mongoose=require('mongoose');
const VoteSchema = new mongoose.Schema({
    type: { type: String},
    title: { type: String},
    quorumId:String,
    shortDesc: String,
    longDesc: String,
    rollCall: String,
    readMore: String,
    date: Date,
    congress: { type: String },
   termId: { type: mongoose.Schema.Types.ObjectId, ref: 'terms' },
  },{timestamps: true});

  module.exports=mongoose.model('votes', VoteSchema);