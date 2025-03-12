const mongoose = require('mongoose');

const TermSchema = new mongoose.Schema({
    name: String
  });
  
  module.exports=mongoose.model('terms', TermSchema);