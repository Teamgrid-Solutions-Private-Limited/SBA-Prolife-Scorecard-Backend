const mongoose = require('mongoose');

const senatorHistorySchema = new mongoose.Schema({
  senatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Senator',
    required: true,
    unique: true // ensure one doc per senator
  },
  history: [
    {
      oldData: Object,
      timestamp: {
        type: Date,
        default: Date.now
      },
      actionType: {
        type: String,
        enum: ['update', 'delete'],
        default: 'update'
      }
    }
  ]
});

module.exports = mongoose.model('SenatorHistorys', senatorHistorySchema);
