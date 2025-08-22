const mongoose = require('mongoose');
// Add this helper function
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
 
// Rule: If (endYear - startYear) === 2 → should only have 1 congress
if (endYear - startYear === 2 && congresses.length > 1) {
  congresses.splice(1); // keep only the first congress
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
 
// Add pre-save middleware to automatically calculate congresses
TermSchema.pre('save', function(next) {
  this.congresses = getCongresses(this.startYear, this.endYear);
  next();
});
 
// Add instance method to get congresses anytime
TermSchema.methods.getCongressesList = function() {
  return getCongresses(this.startYear, this.endYear);
};
module.exports = mongoose.model('terms', TermSchema);