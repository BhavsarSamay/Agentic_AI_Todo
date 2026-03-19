const User = require("../models/userModel");
const helper = require("../helper/helper");
const resMsg = require("../../res_msg.json");

/**
 * Register a new user
 */
exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: resMsg.USER_ALREADY_EXISTS.message,
      });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      email,
      password,
      phone,
    });

    await user.save();

    // Generate token
    const token = helper.generateToken(user._id);

    return res.status(201).json({
      success: true,
      message: resMsg.USER_CREATED.message,
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "register",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: resMsg.INTERNAL_ERROR.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Login user
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    // Find user
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: resMsg.INVALID_CREDENTIALS.message,
      });
    }

    // Compare password
    const isPasswordMatched = await user.comparePassword(password);
    if (!isPasswordMatched) {
      return res.status(401).json({
        success: false,
        message: resMsg.INVALID_CREDENTIALS.message,
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = helper.generateToken(user._id);

    return res.status(200).json({
      success: true,
      message: resMsg.LOGIN_SUCCESS.message,
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "login",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: resMsg.INTERNAL_ERROR.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get user profile
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: resMsg.USER_NOT_FOUND.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile retrieved successfully",
      data: user,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "getProfile",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: resMsg.INTERNAL_ERROR.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Update user profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, bio, preferences } = req.body;

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (bio !== undefined) updateData.bio = bio;
    if (preferences) updateData.preferences = { ...req.user.preferences, ...preferences };

    const user = await User.findByIdAndUpdate(
      req.userId,
      updateData,
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: resMsg.USER_UPDATED.message,
      data: user,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "updateProfile",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: resMsg.INTERNAL_ERROR.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Change password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }

    const user = await User.findById(req.userId).select("+password");

    const isPasswordMatched = await user.comparePassword(currentPassword);
    if (!isPasswordMatched) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "changePassword",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: resMsg.INTERNAL_ERROR.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Delete user account
 */
exports.deleteAccount = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.userId);

    return res.status(200).json({
      success: true,
      message: resMsg.USER_DELETED.message,
    });
  } catch (error) {
    helper.logErrorInFile("Error_log", {
      function: "deleteAccount",
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: resMsg.INTERNAL_ERROR.message,
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
