const fs = require("fs");
const path = require("path");
const moment = require("moment");
const jwt = require("jsonwebtoken");

/**
 * Generate random string
 */
exports.generateRandomString = (length = 10) => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
};

/**
 * Generate JWT token
 */
exports.generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY || "7d",
  });
};

/**
 * Verify JWT token
 */
exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Log error to file
 */
exports.logErrorInFile = (folderName, errorData) => {
  try {
    const logFolder = path.join(__dirname, "../../Logs", folderName);

    // Ensure directory exists
    if (!fs.existsSync(logFolder)) {
      fs.mkdirSync(logFolder, { recursive: true });
    }

    const fileName = `${moment().format("YYYY-MM-DD")}.log`;
    const filePath = path.join(logFolder, fileName);
    const logEntry =
      `[${moment().format("YYYY-MM-DD HH:mm:ss")}] ${JSON.stringify(
        errorData
      )}\n`;

    fs.appendFileSync(filePath, logEntry);
  } catch (error) {
    console.error("Error while logging:", error);
  }
};

/**
 * Paginate array or query results
 */
exports.paginate = (data, page = 1, limit = 10) => {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;

  const pagination = {
    total: data.length,
    page,
    limit,
    pages: Math.ceil(data.length / limit),
    data: data.slice(startIndex, endIndex),
  };

  return pagination;
};

/**
 * Format response
 */
exports.sendResponse = (res, statusCode, success, message, data = null) => {
  const response = {
    success,
    message,
  };

  if (data) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Validate email format
 */
exports.isValidEmail = (email) => {
  const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  return emailRegex.test(email);
};

/**
 * Get file size in readable format
 */
exports.getReadableFileSize = (bytes) => {
  const sizes = ["Bytes", "KB", "MB", "GB"];
  if (bytes === 0) return "0 Bytes";

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
};

/**
 * Create directory if not exists
 */
exports.createDirectoryIfNotExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Delete file
 */
exports.deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting file:", error);
    return false;
  }
};

/**
 * Get weekday name
 */
exports.getWeekdayName = (date) => {
  return moment(date).format("dddd");
};

/**
 * Get date difference in days
 */
exports.getDateDifference = (startDate, endDate) => {
  return moment(endDate).diff(moment(startDate), "days");
};

/**
 * Format date
 */
exports.formatDate = (date, format = "YYYY-MM-DD HH:mm:ss") => {
  return moment(date).format(format);
};
