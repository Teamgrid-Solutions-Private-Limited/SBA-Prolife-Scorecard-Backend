const bcrypt = require('bcryptjs');
const User = require('../models/userSchema');
const sendEmail = require('../config/send-email');

const sendInvite = async (req, res) => {
  try {
    const { email, role, password, fullName, nickName } = req.body;

    if (!email || !role || !password || !fullName) {
      return res.status(400).json({ 
        message: 'Email, role, password, and fullName are required' 
      });
    }
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email.' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      email: email.toLowerCase(),
      role,
      password: hashedPassword,
      fullName,
      nickName: nickName || null
    });
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://demos.godigitalalchemy.com/scorecard/admin'  
      : 'http://localhost:3001/scorecard/admin';

    const loginUrl = `${baseUrl}/login`;
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Welcome to SBA Scorecard Admin</h2>
        <p>Hi ${fullName},</p>
        <p>Your account has been created as a${role === 'admin' ? 'n' : ''} <strong>${role}</strong>.</p>
        <div style="background-color: #f8f9fa; padding: 15px; margin: 15px 0; border-left: 4px solid #2c3e50;">
          <p><strong>Your Login Credentials</strong></p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Password:</strong> <span style="font-family: monospace; font-size: 16px; background: #eee; padding: 4px 8px; border-radius: 4px;">${password}</span></p>
          <p style="color: #2c3e50;">Please save these credentials for accessing the admin dashboard.</p>
        </div>
        <p>You can now login to your account using the button below:</p>
        <p style="text-align: center;">
          <a href="${loginUrl}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Login to Dashboard</a>
        </p>
        <p>If the button above doesn't work, visit: <br>
        <span style="background-color: #f8f9fa; padding: 5px; word-break: break-all;">${loginUrl}</span></p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p>Best regards,<br>SBA Pro-Life Team</p>
      </div>
    `;

    await sendEmail({
      email: email,
      subject: 'Welcome to SBA Scorecard Admin - Your Account Details',
      message: emailContent
    });

    res.status(200).json({ 
      message: 'User account created and invite sent successfully',
      user: {
        email: newUser.email,
        fullName: newUser.fullName,
        role: newUser.role
      }
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error creating user account', 
      error: error.message 
    });
  }
};

module.exports = sendInvite;
