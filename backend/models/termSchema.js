const mongoose = require('mongoose');
function getCongresses(startYear, endYear) {
  if (startYear < 1789 || endYear < 1789) {
    throw new Error("Congress calculation starts from 1789");
  }
 
 const congresses = [];
for (let year = startYear; year < endYear; year++) {
  const congressNumber = Math.floor((year - 1789) / 2) + 1;
 
  if (!congresses.includes(congressNumber)) {
    congresses.push(congressNumber);
  }
}
 if (endYear - startYear === 2 && congresses.length > 1) {
  congresses.splice(1); 
}
 
  return congresses;
}
 
const TermSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  startYear: {
    type: Number,
    required: true,
  },
  endYear: {
    type: Number,
    required: true,
  },
  congresses: [{
    type: Number,
  }],
}, { timestamps: true });
 TermSchema.pre('save', function(next) {
  this.congresses = getCongresses(this.startYear, this.endYear);
  next();
});
 TermSchema.methods.getCongressesList = function() {
  return getCongresses(this.startYear, this.endYear);
};
module.exports = mongoose.model('terms', TermSchema);