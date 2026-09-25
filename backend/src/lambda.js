const serverless = require("@vendia/serverless-express");
const app = require("./app");

/**
 * AWS Lambda handler wrapping the Express application via serverless-express adapter.
 */
exports.handler = serverless({ app });
