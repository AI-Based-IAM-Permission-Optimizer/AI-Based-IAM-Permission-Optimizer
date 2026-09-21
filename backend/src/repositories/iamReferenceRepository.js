const referenceData = require("../data/iamReferenceData.json");

class IamReferenceRepository {
  /**
   * @param {Object} [data] - Optional reference data override (defaults to imported JSON).
   */
  constructor(data = referenceData) {
    this.data = data;
  }

  /**
   * Deeply clones data to prevent callers from mutating internal state.
   *
   * @template T
   * @param {T} obj
   * @returns {T}
   * @private
   */
  #clone(obj) {
    if (!obj) return obj;
    if (typeof structuredClone === "function") {
      return structuredClone(obj);
    }
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Returns all users from the reference dataset.
   *
   * @returns {Array<Object>} List of IAM user reference records.
   */
  getAllUsers() {
    const users = this.data && Array.isArray(this.data.users) ? this.data.users : [];
    return this.#clone(users);
  }

  /**
   * Retrieves a single user reference record by exact user_id.
   *
   * @param {string} userId - Exact user_id string to match.
   * @returns {Object|null} Matching user record or null if not found.
   */
  getUserById(userId) {
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      return null;
    }

    const trimmedId = userId.trim();
    const users = this.data && Array.isArray(this.data.users) ? this.data.users : [];
    const found = users.find((user) => user && user.user_id === trimmedId);

    if (!found) {
      return null;
    }

    return this.#clone(found);
  }
}

// Export singleton helper methods along with the Repository class
const defaultRepository = new IamReferenceRepository();

module.exports = {
  IamReferenceRepository,
  getAllUsers: () => defaultRepository.getAllUsers(),
  getUserById: (userId) => defaultRepository.getUserById(userId)
};
