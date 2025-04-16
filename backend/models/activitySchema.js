const mongoose=require('mongoose');
const activitySchema = new mongoose.Schema({
    type: { type: String, enum: ['senate', 'house'] },
    title: { type: String, required: true },
    shortDesc: String,
    longDesc: String,
    rollCall: String,
    readMore: String,
    date: Date,
    congress: { type: String },
    termId: { type: mongoose.Schema.Types.ObjectId, ref: 'terms' }
  });

  module.exports=mongoose.model('activities', activitySchema);