export const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || "Internal server error";

  // Handle Mongoose duplicate key error (E11000)
  if (err.code === 11000) {
    statusCode = 409;
    message = "User with this email or username already exists";
  }

  // Handle Mongoose validation errors. `fields` maps each invalid path
  // (dot notation for nested paths) to its message so forms can show
  // per-field errors; plain errors keep the single-key { error } shape.
  let fields;
  if (err.name === "ValidationError") {
    statusCode = 400;
    const entries = Object.entries(err.errors || {});
    message = entries.length > 0 ? entries.map(([, e]) => e.message).join(", ") : "Validation failed";
    if (entries.length > 0) {
      fields = Object.fromEntries(entries.map(([path, e]) => [path, e.message]));
    }
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Authentication token missing or malformed";
  }

  return res.status(statusCode).json(fields ? { error: message, fields } : { error: message });
};

export default errorMiddleware;
