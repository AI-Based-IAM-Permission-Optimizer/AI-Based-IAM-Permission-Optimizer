function notFoundHandler(request, _response, next) {
  const error = new Error(`Route not found: ${request.method} ${request.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function errorHandler(error, _request, response, _next) {
  const statusCode = error.statusCode || 500;

  response.status(statusCode).json({
    error: {
      message: statusCode === 500 ? "Internal server error" : error.message
    }
  });
}

module.exports = { notFoundHandler, errorHandler };
