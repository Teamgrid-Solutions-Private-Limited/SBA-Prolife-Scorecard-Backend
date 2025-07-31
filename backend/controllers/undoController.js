const mongoose = require('mongoose');
const ChangeLog = require('../models/changeLogModel');
const Senator = require('../models/senatorSchema');
const SenatorData = require('../models/senatorDataSchema');

const models = {
  Senator,
  SenatorData,
};

const nameMap = {
  senators: 'Senator',
  senator_datas: 'SenatorData',
};

const undoLastChange = async (req, res) => {
  let { modelName, documentId } = req.params;
  const normalizedModelName = nameMap[modelName] || modelName;

  const Model = models[normalizedModelName];
  if (!Model) {
    return res.status(400).json({ message: 'Invalid model' });
  }

  try {
    const { ObjectId } = mongoose.Types;

    const lastChange = await ChangeLog.findOne({
      modelName: { $in: [modelName, normalizedModelName] },
      documentId: new ObjectId(documentId),
    }).sort({ changedAt: -1 });

    if (!lastChange) {
      return res.status(404).json({ message: 'No change found for this document' });
    }

    const updated = await Model.findByIdAndUpdate(documentId, lastChange.oldData, { new: true });
    await ChangeLog.findByIdAndDelete(lastChange._id);

    return res.status(200).json({ message: 'Undo successful', data: updated });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

module.exports = { undoLastChange };
