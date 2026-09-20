class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

class RepositoryError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "RepositoryError";
    this.statusCode = 500;
    if (cause) {
      this.cause = cause;
    }
  }
}

module.exports = {
  ValidationError,
  NotFoundError,
  RepositoryError
};
