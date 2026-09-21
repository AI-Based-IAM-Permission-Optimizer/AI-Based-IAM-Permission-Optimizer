const express = require("express");

/**
 * Creates recommendation express routes using the provided controller instance.
 *
 * @param {import("../controllers/recommendation.controller")} controller - RecommendationController instance.
 * @returns {import("express").Router} Configured recommendation router.
 */
function createRecommendationRouter(controller) {
  if (!controller) {
    throw new Error("createRecommendationRouter requires a valid controller instance.");
  }

  const router = express.Router();

  router.get("/", controller.list);
  router.get("/:id", controller.getById);

  return router;
}

module.exports = createRecommendationRouter;
