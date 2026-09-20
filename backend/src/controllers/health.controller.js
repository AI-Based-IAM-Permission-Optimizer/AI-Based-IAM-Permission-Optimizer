function getHealth(_request, response) {
  response.status(200).json({
    status: "ok",
    service: "iam-permission-optimizer-backend"
  });
}

module.exports = { getHealth };
