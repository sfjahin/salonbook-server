/** 404 for routes that do not exist. */
export function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  })
}

/** Central error handler so every failure answers with a JSON body. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message)

  const status = err.status || err.statusCode || 500

  res.status(status).json({
    success: false,
    message:
      status === 500 ? "Something went wrong on the server." : err.message,
  })
}

/** Wraps async route handlers so rejections reach the error handler. */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next)

/** Throws a 400-style error with a user facing message. */
export function badRequest(message) {
  const error = new Error(message)
  error.status = 400
  return error
}

export function unauthorized(message = "Authentication required.") {
  const error = new Error(message)
  error.status = 401
  return error
}

export function forbidden(message = "You do not have permission to do that.") {
  const error = new Error(message)
  error.status = 403
  return error
}

export function notFoundError(message = "Resource not found.") {
  const error = new Error(message)
  error.status = 404
  return error
}
