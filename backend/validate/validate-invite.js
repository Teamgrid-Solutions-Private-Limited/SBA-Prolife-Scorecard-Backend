const Invite = require('../models/inviteSchema');

const validateInvite = async (req, res) => {
  const { token, email } = req.query;
  try {
    const invite = await Invite.findOne({ token, email });
    if (!invite || invite.expiresAt < Date.now()) {
      return res.status(400).json({ message: 'Invite is invalid or expired.' });
    }
    res.status(200).json({ message: 'Invite is valid', role: invite.role });
  } catch (err) {
    res.status(500).json({ message: 'Validation failed', err });
  }
};
module.exports = validateInvite;
