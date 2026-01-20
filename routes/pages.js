const express = require("express");
const router = express.Router();
const { getVisitorPayload, sendA4TDisplayHit } = require('../services/target');

router.get("/about", async (req, res) => {
  const targetResponse = await req.getTargetOffers(["redirect"]);
  const { offers, analytics } = targetResponse;
  const visitorPayload = await getVisitorPayload(req, res, "redirect");

  if (
    offers["redirect"] &&
    offers["redirect"].type === 'redirect' &&
    offers["redirect"].redirectUrl
  ) {
    // Send A4T display hit for each mbox with analytics data
    for (const analyticsData of analytics) {
      if (analyticsData.analyticsPayload?.tnta) {
        await sendA4TDisplayHit(
          req,
          res,
          analyticsData,
          "sst:about",
          visitorPayload,
        );
      }
    }
    return res.redirect(offers["redirect"].redirectUrl);
  } else {
    res.render("about", {
      title: "About Us",
    });
  }
});

router.get("/landingpage", (req, res) => {
  res.render("landingpage", {
    title: "Special Offer",
  });
});

module.exports = router;
