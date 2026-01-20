const express = require('express');
const router = express.Router();
const { getVisitorPayload, sendA4TDisplayHit } = require('../services/target');

router.get('/', async (req, res) => {
  const targetResponse = await req.getTargetOffers(['homepage-hero']);
  const { offers, analytics } = targetResponse;

  // Generate visitor payload (creates ECID for new visitors via demdex)
  const visitorPayload = await getVisitorPayload(req, res, 'homepage-hero');

  // Send A4T display hit for each mbox with analytics data
  for (const analyticsData of analytics) {
    if (analyticsData.analyticsPayload?.tnta) {
      await sendA4TDisplayHit(req, res, analyticsData, 'sst:home', visitorPayload);
    }
  }

  // Default content (fallback if no Target offer)
  const heroContent = offers['homepage-hero']?.content || {
    headline: 'Welcome to Our Site',
    subheadline: 'Discover amazing products and services',
    buttonText: 'Get Started',
    backgroundColor: 'green'
  };

  res.render('index', {
    title: 'Home',
    hero: heroContent,
    targetAnalytics: analytics,
    visitorState: visitorPayload?.serverState
  });
});

module.exports = router;
