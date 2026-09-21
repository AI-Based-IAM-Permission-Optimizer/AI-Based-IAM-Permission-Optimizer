const express = require("express");

/**
 * Creates policy express routes using the provided PolicyController instance.
 *
 * @param {import("../controllers/policy.controller")} controller - PolicyController instance.
 * @returns {import("express").Router} Configured policy router.
 */
function createPolicyRouter(controller) {
  if (!controller) {
    throw new Error("createPolicyRouter requires a valid PolicyController instance.");
  }

  const router = express.Router();

  router.get("/:user_id", controller.getPolicyByMlUserId);

  return router;
}

module.exports = createPolicyRouter;
