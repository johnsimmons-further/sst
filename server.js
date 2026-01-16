require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const TargetClient = require('@adobe/target-nodejs-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cookieParser());
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set up EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Adobe Target Configuration
const targetConfig = {
  client: process.env.ADOBE_TARGET_CLIENT,
  organizationId: process.env.ADOBE_TARGET_ORG_ID,
  propertyToken: process.env.ADOBE_TARGET_PROPERTY_TOKEN,
  decisioningMethod: 'server-side',
  timeout: 5000,
  logger: {
    debug: (...args) => console.log('[Target Debug]', ...args),
    error: (...args) => console.error('[Target Error]', ...args)
  }
};

let targetClient = null;

// Initialize Target Client
async function initializeTarget() {
  if (!process.env.ADOBE_TARGET_CLIENT || !process.env.ADOBE_TARGET_ORG_ID) {
    console.warn('Adobe Target credentials not configured. Running in demo mode.');
    return null;
  }

  try {
    targetClient = TargetClient.create(targetConfig);
    console.log('Adobe Target SDK initialized successfully');
    return targetClient;
  } catch (error) {
    console.error('Failed to initialize Adobe Target SDK:', error);
    return null;
  }
}

// Helper: Save Target cookie to response
function saveTargetCookie(res, cookie) {
  if (!cookie) return;
  res.cookie(cookie.name, cookie.value, { maxAge: cookie.maxAge * 1000 });
}

// Helper: Get offers from Adobe Target
async function getTargetOffers(req, res, mboxNames) {
  if (!targetClient) {
    // Return demo content when Target is not configured
    const result = {
      offers: mboxNames.reduce((acc, name) => {
        acc[name] = { content: null, isDemo: true };
        return acc;
      }, {}),
      analytics: [],
      isDemo: true
    };
    return result;
  }

  const targetCookie = req.cookies[TargetClient.TargetCookieName];

  const request = {
    context: {
      channel: 'web',
      address: {
        url: `${req.protocol}://${req.get('host')}${req.originalUrl}`
      },
      userAgent: req.get('User-Agent')
    },
    execute: {
      mboxes: mboxNames.map((name, index) => ({
        name,
        index
      }))
    },
    // Enable client-side analytics for A4T
    experienceCloud: {
      analytics: {
        logging: 'client_side'
      }
    }
  };

  try {
    const response = await targetClient.getOffers({
      request,
      targetCookie
    });

    console.log('🎄 Target response:', JSON.stringify(response));

    // Save the Target cookie for session tracking
    saveTargetCookie(res, response.targetCookie);

    // Extract content and A4T analytics data from mbox responses
    const offers = {};
    const analytics = [];

    if (response.response?.execute?.mboxes) {
      response.response.execute.mboxes.forEach((mbox) => {
        const content = mbox.options?.[0]?.content || null;

        // Extract A4T analytics data for each mbox
        const mboxAnalytics = {
          mboxName: mbox.name,
          activityId: null,
          experienceId: null,
          analyticsPayload: null,
          responseTokens: {},
          // Web SDK proposition fields
          propositionId: null,
          scopeDetailsId: null,
          eventToken: null
        };

        // Get analytics payload from mbox options
        if (mbox.options?.[0]) {
          const option = mbox.options[0];

          // Capture eventToken if present (used for display notifications)
          if (option.eventToken) {
            mboxAnalytics.eventToken = option.eventToken;
          }

          // Response tokens contain activity/experience metadata
          if (option.responseTokens) {
            mboxAnalytics.responseTokens = option.responseTokens;
            mboxAnalytics.activityId = option.responseTokens['activity.id'];
            mboxAnalytics.activityName = option.responseTokens['activity.name'];
            mboxAnalytics.experienceId = option.responseTokens['experience.id'];
            mboxAnalytics.experienceName = option.responseTokens['experience.name'];
            mboxAnalytics.offerId = option.responseTokens['offer.id'];
            mboxAnalytics.offerName = option.responseTokens['offer.name'];

            // Generate Web SDK proposition ID in AT:base64 format
            if (mboxAnalytics.activityId && mboxAnalytics.experienceId !== null) {
              const propositionPayload = JSON.stringify({
                activityId: mboxAnalytics.activityId,
                experienceId: mboxAnalytics.experienceId
              });
              mboxAnalytics.propositionId = 'AT:' + Buffer.from(propositionPayload).toString('base64');

              // scopeDetails.id uses similar format
              const scopeDetailsPayload = JSON.stringify({
                activityId: mboxAnalytics.activityId,
                experienceId: mboxAnalytics.experienceId,
                targetType: '0'
              });
              mboxAnalytics.scopeDetailsId = 'AT:' + Buffer.from(scopeDetailsPayload).toString('base64');
            }
          }
        }

        // Get analytics payload from mbox analytics field
        if (mbox.analytics?.payload) {
          mboxAnalytics.analyticsPayload = mbox.analytics.payload;
        }

        // Check if this is a redirect offer
        const option = mbox.options?.[0];
        if (option?.type === 'redirect') {
          offers[mbox.name] = {
            type: 'redirect',
            redirectUrl: option.content,
            isDemo: false,
            analytics: mboxAnalytics
          };
        } else {
          offers[mbox.name] = { content, isDemo: false, analytics: mboxAnalytics };
        }
        analytics.push(mboxAnalytics);
      });
    }

    return {
      offers,
      analytics,
      isDemo: false,
      // Include raw response for debugging
      rawAnalyticsDetails: response.analyticsDetails
    };
  } catch (error) {
    console.error('Error fetching Target offers:', error);
    return {
      offers: mboxNames.reduce((acc, name) => {
        acc[name] = { content: null, error: true };
        return acc;
      }, {}),
      analytics: [],
      error: error.message
    };
  }
}

// Make getTargetOffers and debug info available to routes
app.use((req, res, next) => {
  req.getTargetOffers = (mboxNames) => getTargetOffers(req, res, mboxNames);
  // Pass mbox cookie to all templates for debug display
  const mboxCookieName = TargetClient.TargetCookieName || 'mbox';
  res.locals.debug = {
    mboxCookie: req.cookies[mboxCookieName] || null,
    mboxCookieName
  };
  next();
});

// Routes
app.get('/', async (req, res) => {
  // Request personalized content from Adobe Target (including redirect mbox)
  const targetResponse = await req.getTargetOffers(['homepage-hero']);
  const { offers, analytics, isDemo } = targetResponse;

  // Check for redirect offer first
  // const redirectOffer = offers['homepage-redirect'];
  // if (redirectOffer?.type === 'redirect' && redirectOffer?.redirectUrl) {
  //   // Build redirect URL with A4T activity data for the landing page
  //   const redirectUrl = new URL(redirectOffer.redirectUrl, `${req.protocol}://${req.get('host')}`);

  //   // Append activity/experience info for A4T stitching on landing page
  //   const a4tData = redirectOffer.analytics || {};
  //   if (a4tData.activityId) {
  //     redirectUrl.searchParams.set('at_activityId', a4tData.activityId);
  //   }
  //   if (a4tData.activityName) {
  //     redirectUrl.searchParams.set('at_activityName', a4tData.activityName);
  //   }
  //   if (a4tData.experienceId) {
  //     redirectUrl.searchParams.set('at_experienceId', a4tData.experienceId);
  //   }
  //   if (a4tData.experienceName) {
  //     redirectUrl.searchParams.set('at_experienceName', a4tData.experienceName);
  //   }
  //   if (a4tData.offerId) {
  //     redirectUrl.searchParams.set('at_offerId', a4tData.offerId);
  //   }
  //   if (a4tData.analyticsPayload?.tnta) {
  //     redirectUrl.searchParams.set('at_tnta', a4tData.analyticsPayload.tnta);
  //   }

  //   return res.redirect(302, redirectUrl.toString());
  // }

  // Default content (fallback if no Target offer)
  const heroContent = offers['homepage-hero']?.content ||
  // this is your default content -
  {
    headline: 'Welcome to Our Site',
    subheadline: 'Discover amazing products and services',
    buttonText: 'Get Started',
    backgroundColor: 'green'
  };

  res.render('index', {
    title: 'Home',
    hero: heroContent,
    isDemo,
    targetAnalytics: analytics
  });
});

app.get('/products', async (req, res) => {
  const targetResponse = await req.getTargetOffers(['products-banner']);
  const { offers, analytics, isDemo } = targetResponse;

  const bannerContent = offers['products-banner']?.content || {
    message: 'Check out our latest products!',
    highlight: 'New Arrivals'
  };

  // Sample products (in a real app, fetch from database)
  const products = [
    { id: 1, name: 'Product A', price: 29.99, description: 'A great product' },
    { id: 2, name: 'Product B', price: 49.99, description: 'Another great product' },
    { id: 3, name: 'Product C', price: 19.99, description: 'Budget-friendly option' }
  ];

  res.render('products', {
    title: 'Products',
    banner: bannerContent,
    products,
    isDemo,
    targetAnalytics: analytics
  });
});

app.get('/about', (req, res) => {
  res.render('about', { title: 'About Us', targetAnalytics: [] });
});

app.get('/landingpage', (req, res) => {
  // Parse A4T redirect data from URL params (from server-side redirect)
  const redirectA4TData = {
    activityId: req.query.at_activityId || null,
    activityName: req.query.at_activityName || null,
    experienceId: req.query.at_experienceId || null,
    experienceName: req.query.at_experienceName || null,
    offerId: req.query.at_offerId || null,
    tnta: req.query.at_tnta || null,
    // Adobe's SDID params (automatically added by Target redirect offers)
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

// Start server
async function start() {
  await initializeTarget();

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    if (!process.env.ADOBE_TARGET_CLIENT) {
      console.log('Running in demo mode - set ADOBE_TARGET_CLIENT and ADOBE_TARGET_ORG_ID in .env');
    }
  });
}

start();
