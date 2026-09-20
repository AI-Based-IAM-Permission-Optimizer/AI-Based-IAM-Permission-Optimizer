require("dotenv").config();

const cors = require("cors");
const express = require("express");
const healthRoutes = require("./routes/health.routes");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api", healthRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
