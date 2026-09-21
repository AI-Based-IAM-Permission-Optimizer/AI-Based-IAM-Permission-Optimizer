/**
 * Policy Generator Service
 *
 * Combines baseline IAM policy reference data with recommendation records to generate
 * a proposed least-privilege IAM policy object.
 */

/**
 * Generates a proposed least-privilege IAM policy object.
 *
 * ONLY recommendations with recommendation === "REMOVE" AND approval_status === "APPROVED"
 * will cause matching actions to be removed from the generated policy statement.
 * All other actions (KEEP, REVIEW, PENDING REMOVE, REJECTED REMOVE, or un-recommended actions)
 * are strictly preserved.
 *
 * @param {Object} userReference - IAM reference user object from iamReferenceRepository.
 * @param {Array<Object>} [recommendations] - List of recommendation objects.
 * @returns {Object} Generated IAM policy object { Version, Statement: [...] }.
 */
function generatePolicy(userReference, recommendations = []) {
  if (!userReference || !userReference.attached_policies || !Array.isArray(userReference.attached_policies)) {
    return {
      Version: "2012-10-17",
      Statement: []
    };
  }

  const safeRecs = Array.isArray(recommendations) ? recommendations : [];

  // Build lookup map for APPROVED REMOVE recommendations by action
  const approvedRemoveActionsMap = new Map();
  for (const rec of safeRecs) {
    if (
      rec &&
      rec.action &&
      rec.recommendation === "REMOVE" &&
      rec.approval_status === "APPROVED"
    ) {
      approvedRemoveActionsMap.set(rec.action, rec);
    }
  }

  const generatedStatements = [];

  for (const policy of userReference.attached_policies) {
    if (!policy || !Array.isArray(policy.statements)) continue;

    for (const statement of policy.statements) {
      if (!statement) continue;

      const effect = statement.effect || statement.Effect || "Allow";
      const resource = statement.resource || statement.Resource || "*";
      const rawActions = statement.action || statement.Action || [];
      const actionList = Array.isArray(rawActions) ? rawActions : [rawActions];

      // Keep actions unless there is an APPROVED REMOVE recommendation for the action
      const remainingActions = actionList.filter((action) => {
        const removeRec = approvedRemoveActionsMap.get(action);
        if (!removeRec) {
          return true; // Keep permission
        }
        // Match resource if specific, or default true if statement/recommendation resource is "*"
        if (!removeRec.resource || removeRec.resource === "*" || resource === "*" || removeRec.resource === resource) {
          return false; // Remove permission
        }
        return true; // Keep permission
      });

      // Omit statement if all actions in this statement were removed
      if (remainingActions.length > 0) {
        generatedStatements.push({
          Effect: effect,
          Action: remainingActions,
          Resource: resource
        });
      }
    }
  }

  const version = (userReference.attached_policies[0] && userReference.attached_policies[0].policy_version)
    ? userReference.attached_policies[0].policy_version
    : "2012-10-17";

  return {
    Version: version,
    Statement: generatedStatements
  };
}

module.exports = {
  generatePolicy
};
