const mongoose=require('mongoose');
const GlobalSettingSchema = new mongoose.Schema({
    asOnDate: Date
  });


module.exports=mongoose.model('globalSettings', GlobalSettingSchema);