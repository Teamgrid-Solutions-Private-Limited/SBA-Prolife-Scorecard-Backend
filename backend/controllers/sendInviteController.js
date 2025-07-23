const crypto = require('crypto');
const Invite = require('../models/inviteSchema');
const sendEmail = require('../config/send-email');

const sendInvite = async (req, res) => {
  const { email, role } = req.body;

  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

    await Invite.create({ email, role, token, expiresAt });

    // Define base URL based on environment
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://demos.godigitalalchemy.com/scorecard'  // Replace with your actual production domain
      : 'http://localhost:3000';

    const inviteLink = `${baseUrl}/signup?token=${token}&email=${encodeURIComponent(email)}`;

    // Create email content with both clickable link and full URL
    const emailContent = `
      <p>You have been invited to join SBA Scorecard Admin.</p>
      <p>Click <a href="${inviteLink}">here</a> to complete your signup.</p>
      <p>If the button above doesn't work, copy and paste this URL into your browser:</p>
      <p>${inviteLink}</p>
      <p>This invitation link will expire in 24 hours.</p>
      <br>
      <p>Best regards,</p>
      <p>SBA Pro-Life Team</p>
    `;

    await sendEmail({
      email: email,
      subject: 'Welcome to SBA Scorecard Admin - Complete Your Registration',
      message: emailContent
    });

    res.status(200).json({ message: 'Invite sent successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Error sending invite', error });
  }
};

module.exports = sendInvite;
