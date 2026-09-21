require("dotenv").config();

const cors = require("cors");
const express = require("express");
const healthRoutes = require("./routes/health.routes");
const createRecommendationRouter = require("./routes/recommendation.routes");
const createPolicyRouter = require("./routes/policy.routes");
const RecommendationController = require("./controllers/recommendation.controller");
const PolicyController = require("./controllers/policy.controller");
const RecommendationService = require("./services/recommendation.service");
const { PolicyRecommendationService } = require("./services/policyRecommendationService");
const RecommendationRepository = require("./repositories/recommendation.repository");
const { createAwsClients } = require("./config/aws");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

// Base health endpoint
app.use("/api", healthRoutes);

// Initialize component stack
const { docClient } = createAwsClients();
const recommendationRepository = new RecommendationRepository(docClient);
const recommendationService = new RecommendationService(recommendationRepository);
const recommendationController = new RecommendationController(recommendationService);

const policyRecommendationService = new PolicyRecommendationService(recommendationRepository);
const policyController = new PolicyController(policyRecommendationService);

// Mount REST APIs
app.use("/api/v1/recommendations", createRecommendationRouter(recommendationController));
app.use("/api/v1/policies", createPolicyRouter(policyController));

// Centralized error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
