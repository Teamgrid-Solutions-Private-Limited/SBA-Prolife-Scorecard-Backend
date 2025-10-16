const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/userSchema");
const sendEmail = require("../config/send-email");

const sendInvite = async (req, res) => {
  try {
    const { email, role, fullName, nickName } = req.body;

    if (!email || !role || !fullName) {
      return res.status(400).json({
        message: "Email, role, and fullName are required",
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists with this email." });
    }

    const inviteToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const newUser = await User.create({
      email: email.toLowerCase(),
      role,
      password: null,
      fullName,
      nickName: nickName || null,
      status: "invited",
      inviteToken,
      tokenExpiry,
      invitedAt: new Date(),
    });

    const baseUrl = "https://demos.godigitalalchemy.com/scorecard/admin";

    const activationUrl = `${baseUrl}/activate-account?token=${inviteToken}`;
    const emailContent = `
    <div style="width: 100%; background-color: #f8f9fa; padding: 40px 0;">
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
        <div style="text-align: center; margin-bottom: 25px;">
        <h1 style="margin: 0; font-size: 24px; font-weight: bold; color: #333;">Invitation to join SBA Pro-Life Scorecard Administrative System</h1>
    </div>

    <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
      <p style="margin: 0 0 15px; line-height: 1.6; color: #333;">
        Dear <strong>${fullName}</strong>,
      </p>

      <p style="margin: 0 0 15px; line-height: 1.6; color: #333;">
        You have been invited as a <strong>${role}</strong> to the SBA Pro-Life Scorecard system.
      </p>

      <div style="background: #fffbea; border-left: 4px solid #CC9A3A; padding: 15px; margin: 20px 0;">
        <strong>Action Required:</strong> Please activate your account within 24 hours.
      </div>

    

       <div style="text-align: center; margin: 30px 0;">
          <a href="${activationUrl}" style="background-color: #4F81BD; color: white; padding: 14px 28px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block; font-size: 16px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Activate Your Account</a>
        </div>

      <p style="margin: 20px 0 8px; font-size: 14px; color: #333;">
        If you encounter any issues with the activation link, copy and paste the following URL into your browser:
      </p>

      <div style="background: #f8f9fa; padding: 12px; border-radius: 4px; word-break: break-all; font-size: 12px; margin-bottom: 20px; color: #333;">
        ${activationUrl}
      </div>

      <p style="margin: 0 0 20px; font-size: 14px; color: #333;">
        For security questions or technical assistance, please contact the system administrator.
      </p>
    </div>

    <div style="text-align: center; margin-top: 25px; font-size: 12px; color: #666;">
      <p style="margin: 0 0 5px;"><strong>SBA Pro-Life Scorecard System</strong></p>
      <p style="margin: 0 0 5px;">This is an automated message. Please do not reply.</p>
      <p style="margin: 0;">© 2025 SBA Pro-Life. All rights reserved.</p>
    </div>
  </div>
  </div>

`;

    await sendEmail({
      email: email,
      subject: "Set Up Your SBA Scorecard Admin Account",
      message: emailContent,
    });

    res.status(200).json({
      message:
        "Invitation sent successfully! User will set their password during activation.",
      user: {
        email: newUser.email,
        fullName: newUser.fullName,
        role: newUser.role,
        status: "invited",
      },
    });
  } catch (error) {
    console.error("Error in sendInvite:", error);
    res.status(500).json({
      message: "Error creating user account",
      error: error.message,
    });
  }
};

const verifyActivation = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Activation token is required" });
    }

    const user = await User.findOne({
      inviteToken: token,
      status: "invited",
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired activation link" });
    }

    if (user.tokenExpiry < new Date()) {
      return res.status(400).json({ message: "Activation link has expired" });
    }

    res.status(200).json({
      valid: true,
      user: {
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Error verifying activation",
      error: error.message,
    });
  }
};

const activateAccount = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Activation token is required" });
    }

    if (!password) {
      return res.status(400).json({
        message: "Password is required to activate your account",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    const user = await User.findOne({
      inviteToken: token,
      status: "invited",
      tokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired activation link" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.status = "active";
    user.inviteToken = null;
    user.tokenExpiry = null;
    user.activatedAt = new Date();

    await user.save();

    res.status(200).json({
      message:
        "Account activated successfully! You can now login with your new password.",
      user: {
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Error activating account",
      error: error.message,
    });
  }
};

module.exports = { sendInvite, verifyActivation, activateAccount };
