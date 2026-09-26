const { generatePolicy } = require("./policyGeneratorService");
const { ValidationError } = require("../utils/errors");

/**
 * Policy Orchestration Service
 *
 * Coordinates reference user resolution data with recommendation datasets
 * and delegates policy creation to the Policy Generator Service.
 */

/**
 * Generates a least-privilege policy package for a given IAM reference user.
 *
 * @param {Object} userReference - Resolved IAM reference user object.
 * @param {Array<Object>} recommendations - Array of recommendation records for the reference user.
 * @returns {Object} Orchestrated policy result package containing source_policy details and generated policy.
 */
function generatePolicyForReferenceUser(userReference, recommendations) {
  if (!userReference || typeof userReference !== "object" || Array.isArray(userReference)) {
    throw new ValidationError("Parameter 'userReference' is required and must be a valid reference user object.");
  }

  if (!Array.isArray(recommendations)) {
    throw new ValidationError("Parameter 'recommendations' is required and must be an array.");
  }

  // Delegate actual policy generation decision logic to policyGeneratorService
  const generatedPolicy = generatePolicy(userReference, recommendations);

  // Extract source policy metadata from the first attached policy
  const attachedPolicy = (userReference.attached_policies && Array.isArray(userReference.attached_policies) && userReference.attached_policies.length > 0)
    ? userReference.attached_policies[0]
    : null;

  const sourcePolicy = {
    policy_name: attachedPolicy ? attachedPolicy.policy_name : null,
    policy_version: attachedPolicy ? attachedPolicy.policy_version : "2012-10-17"
  };

  const actualRoleId = (recommendations && recommendations.length > 0 && recommendations[0].role_id)
    ? recommendations[0].role_id
    : userReference.role_id;

  return {
    user_id: userReference.user_id,
    role_id: actualRoleId,
    source_policy: sourcePolicy,
    policy: generatedPolicy,
    generated_at: new Date().toISOString()
  };
}

module.exports = {
  generatePolicyForReferenceUser
};
