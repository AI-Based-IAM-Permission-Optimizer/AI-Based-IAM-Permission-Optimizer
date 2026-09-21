require("dotenv").config();

const cors = require("cors");
const express = require("express");
const healthRoutes = require("./routes/health.routes");
const createRecommendationRouter = require("./routes/recommendation.routes");
const RecommendationController = require("./controllers/recommendation.controller");
const RecommendationService = require("./services/recommendation.service");
const RecommendationRepository = require("./repositories/recommendation.repository");
const { createAwsClients } = require("./config/aws");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

// Base health endpoint
app.use("/api", healthRoutes);

// Initialize recommendation component stack
const { docClient } = createAwsClients();
const recommendationRepository = new RecommendationRepository(docClient);
const recommendationService = new RecommendationService(recommendationRepository);
const recommendationController = new RecommendationController(recommendationService);

// Mount recommendation retrieval REST APIs
app.use("/api/v1/recommendations", createRecommendationRouter(recommendationController));

// Centralized error handling
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
