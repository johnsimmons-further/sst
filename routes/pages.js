const express = require('express');
const router = express.Router();

router.get('/about', (req, res) => {
  res.render('about', { title: 'About Us', targetAnalytics: [] });
});

router.get('/landingpage', (req, res) => {
  // Parse A4T redirect data from URL params (from server-side redirect)
  const redirectA4TData = {
    activityId: req.query.at_activityId || null,
    activityName: req.query.at_activityName || null,
    experienceId: req.query.at_experienceId || null,
    experienceName: req.query.at_experienceName || null,
    offerId: req.query.at_offerId || null,
    tnta: req.query.at_tnta || null,
    sdid: req.query.adobe_mc_sdid || null,
    mboxSession: req.query.mboxSession || null
  };

  // Check if this is a redirect landing (has A4T data)
  const isRedirectLanding = !!(redirectA4TData.activityId || redirectA4TData.sdid);

  res.render('landingpage', {
    title: 'Special Offer',
    targetAnalytics: [],
    redirectA4TData,
    isRedirectLanding
  });
});

module.exports = router;
