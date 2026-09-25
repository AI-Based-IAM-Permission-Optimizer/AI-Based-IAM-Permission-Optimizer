const test = require("node:test");
const assert = require("node:assert/strict");

test("src/lambda.js can be imported without throwing and exports handler function", () => {
  assert.doesNotThrow(() => {
    const lambdaModule = require("../src/lambda");
    assert.equal(typeof lambdaModule.handler, "function");
  });
});

test("src/app.js remains importable and intact alongside Lambda adapter", () => {
  assert.doesNotThrow(() => {
    const app = require("../src/app");
    assert.equal(typeof app, "function");
  });
});
