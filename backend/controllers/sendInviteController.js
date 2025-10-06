
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/userSchema");
const sendEmail = require("../config/send-email");

const sendInvite = async (req, res) => {
  try {
    const { email, role, password, fullName, nickName } = req.body;
   // const adminId = req.user.id; // Assuming you have admin info in req.user

    // 1. Validation
    if (!email || !role || !password || !fullName) {
      return res.status(400).json({
        message: "Email, role, password, and fullName are required",
      });
    }

    // 2. Check existing user
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "User already exists with this email." });
    }

    // 3. Hash the admin-set password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Generate secure token for account activation
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // 5. Create user WITH password (set by admin)
    const newUser = await User.create({
      email: email.toLowerCase(),
      role,
      password: hashedPassword, // Admin sets this
      fullName,
      nickName: nickName || null,
      status: "invited",
      inviteToken,
      tokenExpiry,
      invitedAt: new Date(),
    });

    // 6. Generate activation link
    const baseUrl =
      process.env.NODE_ENV === "production"
        ? "https://demos.godigitalalchemy.com/scorecard/admin"
        : "http://localhost:3001/scorecard/admin";

    const activationUrl = `${baseUrl}/activate-account?token=${inviteToken}`;

    // 7. Send email WITHOUT password
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Your SBA Scorecard Admin Account is Ready</h2>
        <p>Hi ${fullName},</p>
        <p>Your admin account has been created as a${
          role === "admin" ? "n" : ""
        } <strong>${role}</strong>.</p>
        
        <div style="background-color: #fff3cd; padding: 15px; margin: 15px 0; border-left: 4px solid #ffc107;">
          <p><strong>Action Required:</strong> Please activate your account using the link below.</p>
          <p><strong>Note:</strong> This activation link expires in 24 hours</p>
        </div>

        <p>Click the button below to activate your account:</p>
        <p style="text-align: center;">
          <a href="${activationUrl}" style="background-color: #3498db; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Activate Your Account
          </a>
        </p>
        
        <p>If the button doesn't work, copy this link:<br>
        <span style="background-color: #f8f9fa; padding: 5px; word-break: break-all;">${activationUrl}</span></p>
        
        <div style="background-color: #f8f9fa; padding: 15px; margin: 15px 0; border-left: 4px solid #2c3e50;">
          <p><strong>After activation, you can login at:</strong><br>
          ${baseUrl}/scorecard/admin/login</p>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p>Best regards,<br>SBA Pro-Life Team</p>
      </div>
    `;

    await sendEmail({
      email: email,
      subject: "Activate Your SBA Scorecard Admin Account",
      message: emailContent,
    });

    res.status(200).json({
      message: "User account created and activation email sent successfully",
      user: {
        email: newUser.email,
        fullName: newUser.fullName,
        role: newUser.role,
        status: "invited",
        expiresAt: tokenExpiry,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Error creating user account",
      error: error.message,
    });
  }
};

// NEW: Verify activation token
const verifyActivation = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Activation token is required" });
    }

    const user = await User.findOne({
      inviteToken: token,
      status: "invited",
    })

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

// NEW: Activate account (user just confirms, no password change)
const activateAccount = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Activation token is required" });
    }

    // Find user with valid token
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

    // Activate the account (password already set by admin)
    user.status = "active";
    user.inviteToken = null;
    user.tokenExpiry = null;
    user.activatedAt = new Date();

    await user.save();

    res.status(200).json({
      message:
        "Account activated successfully! You can now login with the credentials provided by your administrator.",
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
