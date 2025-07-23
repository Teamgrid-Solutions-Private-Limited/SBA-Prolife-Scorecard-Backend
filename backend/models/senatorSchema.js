const mongoose  = require("mongoose");

const SenatorSchema = new mongoose.Schema({
    name: String,
    state: String,
    party: { type: String, enum: ['democrat', 'independent', 'republican'] },
    photo: String,
    status: { type: String, enum: ['active', 'former'] },
    senatorId: String,
  },{timestamps: true});

  module.exports=mongoose.model('senators', SenatorSchema);