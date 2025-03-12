const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  fullName: String,
  nickName: String,
  email: { type: String, unique: true },
  password: {
    type: String,
    required: true,
     
  },
  role: { type: String, enum: ['admin', 'editor', 'contributor'] }
});

module.exports= mongoose.model("users",UserSchema);