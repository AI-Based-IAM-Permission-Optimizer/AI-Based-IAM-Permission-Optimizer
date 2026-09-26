const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");
const RecommendationController = require("../src/controllers/recommendation.controller");
const { ValidationError, RepositoryError } = require("../src/utils/errors");

/* ========================================================================== */
/* GAP-6: CORS CONFIGURATION TESTS                                           */
/* ========================================================================== */

test("GAP-6: getCorsOptions defaults to origin '*' in non-production when CORS_ORIGINS is unset", () => {
  const options = app.getCorsOptions({ NODE_ENV: "development" });
  assert.equal(options.origin, "*");
});

test("GAP-6: getCorsOptions restricts origin to false in production when CORS_ORIGINS is unset", () => {
  const options = app.getCorsOptions({ NODE_ENV: "production" });
  assert.equal(options.origin, false);
});

test("GAP-6: getCorsOptions parses comma-separated list in CORS_ORIGINS", () => {
  const options = app.getCorsOptions({
    CORS_ORIGINS: "http://localhost:3000, https://app.company.com "
  });
  assert.deepEqual(options.origin, ["http://localhost:3000", "https://app.company.com"]);
});

test("GAP-6: getCorsOptions returns origin '*' when CORS_ORIGINS explicitly contains '*'", () => {
  const options = app.getCorsOptions({ CORS_ORIGINS: "*" });
  assert.equal(options.origin, "*");
});

/* ========================================================================== */
/* GAP-2: SAFE LOGGING TESTS                                                 */
/* ========================================================================== */

test("GAP-2: 4xx application errors log warning without stack trace noise", async () => {
  const warnCalls = [];
  const errorCalls = [];
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args) => warnCalls.push(args.join(" "));
  console.error = (...args) => errorCalls.push(args.join(" "));

  try {
    const mockService = {
      listRecommendations: async () => {
        throw new ValidationError("Filter 'approval_status' must be valid.");
      }
    };
    const controller = new RecommendationController(mockService);
    const req = { query: {} };
    const res = {};
    const next = (err) => err;

    await controller.list(req, res, next);

    assert.equal(warnCalls.length, 1);
    assert.equal(errorCalls.length, 0);
    assert.ok(warnCalls[0].includes("[WARN] GET /api/v1/recommendations: ValidationError (400)"));
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
});

test("GAP-2: 5xx unexpected server errors log error details for diagnosis", async () => {
  const warnCalls = [];
  const errorCalls = [];
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args) => warnCalls.push(args.join(" "));
  console.error = (...args) => errorCalls.push(args.join(" "));

  try {
    const mockService = {
      listRecommendations: async () => {
        throw new RepositoryError("DynamoDB connection lost");
      }
    };
    const controller = new RecommendationController(mockService);
    const req = { query: {} };
    const res = {};
    const next = (err) => err;

    await controller.list(req, res, next);

    assert.equal(warnCalls.length, 0);
    assert.equal(errorCalls.length, 1);
    assert.ok(errorCalls[0].includes("[ERROR] GET /api/v1/recommendations: RepositoryError DynamoDB connection lost"));
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }
});
