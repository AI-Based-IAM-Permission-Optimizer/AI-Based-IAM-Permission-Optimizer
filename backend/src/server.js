const app = require("./app");

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`IAM Permission Optimizer backend listening on port ${port}`);
});
