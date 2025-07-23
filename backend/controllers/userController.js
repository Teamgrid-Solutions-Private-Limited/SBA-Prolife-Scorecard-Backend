const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/userSchema');
const JWT_SECRET = process.env.JWT_SECRET 
const Invite = require('../models/inviteSchema');

class userController {
 

  // Create a new user
  static async createUser(req, res) {
    try {
      const { fullName, nickName, email, password, role } = req.body;

      // Hash the password before saving
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = new User({
        fullName,
        nickName,
        email,
        password: hashedPassword, // Save the hashed password
        role,
      });

      await newUser.save();
      res.status(201).json({ message: 'User created successfully', user: newUser });
    } catch (error) {
      res.status(400).json({ message: 'Error creating user', error });
    }
  }

  // Get a user by ID
  static async getUserById(req, res) {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.status(200).json(user);
    } catch (error) {
      res.status(400).json({ message: 'Error fetching user', error });
    }
  }

  // Update user details
  static async updateUser(req, res) {
    try {
      const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.status(200).json({ message: 'User updated successfully', user: updatedUser });
    } catch (error) {
      res.status(400).json({ message: 'Error updating user', error });
    }
  }

  // Delete a user
  static async deleteUser(req, res) {
    try {
      const deletedUser = await User.findByIdAndDelete(req.params.id);
      if (!deletedUser) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.status(200).json({ message: 'User deleted successfully' });
    } catch (error) {
      res.status(400).json({ message: 'Error deleting user', error });
    }
  }

  // Login a user
  static async loginUser(req, res) {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }

      // Create JWT token
    //   const token = jwt.sign(
    //     { id: user._id, role: user.role }, // Payload
    //     userController.JWT_SECRET, // Secret key
    //     { expiresIn: '1h' } // Token expiry (1 hour)
    //   );

    const token = jwt.sign(
        {
          id: user._id,
          
          role: user.role,
          
        },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );

      // Respond with the token
      res.status(200).json({
        message: 'Login successful',
        token,
        user: { id: user._id, fullName: user.fullName, nickName: user.nickName, role: user.role }
      });
    } catch (error) {
      res.status(500).json({ message: 'Error logging in', error });
    }
  }
  //assign new user to a role
    // Assign or update user role — Admin only
  static async assignUserRole(req, res) {
    try {
      console.log("req.body:-", req.body);
      const { userId, newRole } = req.body;


      // Validate input
      const validRoles = ['admin', 'editor', 'contributor'];
      if (!validRoles.includes(newRole)) {
        return res.status(400).json({ message: 'Invalid role provided.' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      user.role = newRole;
      await user.save();

      res.status(200).json({
        message: `Role updated to ${newRole}`,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        },
      });
    } catch (error) {
      res.status(500).json({ message: 'Error assigning role', error: error.message });
    }
  }



static signupWithInvite = async (req, res) => {
  const { email, password, token } = req.body;

  try {
    const invite = await Invite.findOne({ email, token });

    if (!invite || invite.expiresAt < Date.now()) {
      return res.status(400).json({ message: 'Invite invalid or expired.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      email,
      password: hashedPassword,
      role: invite.role
    });

    await Invite.deleteOne({ email }); // clean up invite

    res.status(201).json({ message: 'Signup successful', userId: user._id });
  } catch (err) {
    res.status(500).json({ message: 'Signup failed', err });
  }
};

}

module.exports = userController;
