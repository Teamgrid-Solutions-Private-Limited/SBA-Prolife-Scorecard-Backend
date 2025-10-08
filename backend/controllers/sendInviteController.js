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
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SBA Pro-Life Account Invitation</title>
    <style>
      /* Dark mode adjustments (for modern clients like Apple Mail, iOS Mail, and Gmail App) */
      @media (prefers-color-scheme: dark) {
        body, table, td {
          background-color: #121212 !important;
          color: #ffffff !important;
        }
        .email-body {
          background-color: #1e1e1e !important;
        }
        .email-header {
          background-color: #2575fc !important;
          color: #ffffff !important;
        }
        .email-warning {
          background-color: #3a2b0a !important;
          border-left-color: #CC9A3A !important;
          color: #f5d37a !important;
        }
        .email-button {
          background-color: #2575fc !important;
          color: #ffffff !important;
        }
        .email-footer {
          background-color: #1e1e1e !important;
          color: #aaaaaa !important;
        }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; font-family:'Segoe UI', Arial, sans-serif; background-color:#f2f2f2; color:#333;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f2f2f2">
      <tr>
        <td align="center" style="padding: 30px 10px;">
          <table width="600" cellpadding="0" cellspacing="0" border="0" class="email-body" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 0 10px rgba(0,0,0,0.08);">
            
            <!-- Header -->
            <tr>
              <td align="center" bgcolor="#2575fc" class="email-header" style="color:#ffffff; padding:30px 20px;">
                <h1 style="margin:0; font-size:24px; font-weight:600;">SBA Pro-Life Scorecard</h1>
                <p style="margin:8px 0 0; font-size:14px; opacity:0.9;">Administrative System Access</p>
              </td>
            </tr>
            
            <!-- Body -->
            <tr>
              <td style="padding: 30px 40px;">
                <h2 style="color:#2c3e50; margin:0 0 16px; font-size:20px;">Account Invitation</h2>
                
                <p style="margin:0 0 12px;">Dear <strong>${fullName}</strong>,</p>
                
                <p style="margin:0 0 16px;">You have been invited to join the <strong>SBA Pro-Life Scorecard Administrative System</strong> with the following access level:</p>

                <!-- Details box -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8f9fa; border-radius:6px; margin-bottom:20px;">
                  <tr>
                    <td style="padding:15px 20px; font-size:14px;">
                      <p style="margin:0 0 8px;"><strong>Role:</strong> ${
                        role.charAt(0).toUpperCase() + role.slice(1)
                      }</p>
                      <p style="margin:0 0 8px;"><strong>System:</strong> SBA Pro-Life Scorecard Management Portal</p>
                      <p style="margin:0;"><strong>Organization:</strong> SBA Pro-Life</p>
                    </td>
                  </tr>
                </table>

                <!-- Warning box -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" class="email-warning" style="background:#fffbea; border-left:4px solid #CC9A3A; margin-bottom:30px;">
                  <tr>
                    <td style="padding:16px 20px; font-size:14px; color:#705c1f;">
                      <strong>Action Required:</strong> Please activate your account and set up your password within the next 24 hours to complete your registration.
                    </td>
                  </tr>
                </table>

                <!-- Button -->
                <div style="text-align:center; margin:30px 0;">
                  <a href="${activationUrl}" target="_blank" class="email-button" style="background:#2575fc; color:#ffffff; text-decoration:none; padding:14px 28px; border-radius:6px; font-weight:600; font-size:15px; display:inline-block;">
                    Activate Your Account
                  </a>
                </div>

                <!-- Security info -->
                <p style="margin:0 0 8px;"><strong>Important Security Notice:</strong></p>
                <ul style="margin:0 0 20px 20px; padding:0; font-size:14px;">
                  <li>This invitation link is valid for 24 hours.</li>
                  <li>Keep your login credentials secure and confidential.</li>
                  <li>Do not share this invitation email with others.</li>
                </ul>

                <p style="margin:0 0 8px;">If you encounter any issues with the activation link, copy and paste the following URL into your browser:</p>

                <p style="background:#f8f9fa; padding:10px 14px; border-radius:4px; word-break:break-all; font-size:12px; margin-bottom:20px;">
                  ${activationUrl}
                </p>

                <p style="margin:0;">For security questions or technical assistance, please contact the system administrator.</p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td bgcolor="#f8f9fa" class="email-footer" style="padding:20px; text-align:center; font-size:12px; color:#666;">
                <p style="margin:0 0 4px;"><strong>SBA Pro-Life Scorecard System</strong></p>
                <p style="margin:0 0 4px;">This is an automated message. Please do not reply.</p>
                <p style="margin:0;">© ${new Date().getFullYear()} SBA Pro-Life. All rights reserved.</p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
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
