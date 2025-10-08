const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    fullName: String,
    nickName: String,
    email: { type: String, unique: true },
    password: {
      type: String,
    },
    role: { type: String, enum: ["admin", "editor", "contributor"] },
    status: {
      type: String,
      default: "invited",
      enum: ["invited", "active", "inactive"],
    },
    inviteToken: String,
    tokenExpiry: Date,
    invitedAt: Date,
    activatedAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("users", UserSchema);
