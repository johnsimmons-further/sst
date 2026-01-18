require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const TargetClient = require('@adobe/target-nodejs-sdk');
const Visitor = require('@adobe-mcid/visitor-js-server');

const app = express();
const PORT = process.env.PORT || 3000;

// Sample product data
const PRODUCTS = [
  {
    id: 1,
    name: 'Wireless Headphones',
    description: 'Premium noise-canceling wireless headphones with 30-hour battery life.',
    price: 299.99,
    emoji: '🎧',
    color: '#667eea',
    category: 'Electronics',
    sku: 'WH-1000XM5',
    stock: 45,
    features: [
      'Active noise cancellation',
      '30-hour battery life',
      'Touch controls',
      'Multipoint connection',
      'Speak-to-chat technology'
    ]
  },
  {
    id: 2,
    name: 'Smart Watch',
    description: 'Track your fitness and stay connected with this feature-packed smartwatch.',
    price: 399.99,
    emoji: '⌚',
    color: '#11998e',
    category: 'Wearables',
    sku: 'SW-ULTRA-2',
    stock: 28,
    features: [
      'Heart rate monitoring',
      'GPS tracking',
      'Water resistant to 50m',
      '5-day battery life',
      'Sleep tracking'
    ]
  },
  {
    id: 3,
    name: 'Portable Speaker',
    description: 'Powerful portable Bluetooth speaker with 360-degree sound.',
    price: 149.99,
    emoji: '🔊',
    color: '#f5a623',
    category: 'Audio',
    sku: 'PS-BOOM-3',
    stock: 62,
    features: [
      '360-degree sound',
      'IP67 waterproof',
      '24-hour playtime',
      'PartyBoost pairing',
      'Built-in powerbank'
    ]
  },
  {
    id: 4,
    name: 'Mechanical Keyboard',
    description: 'RGB mechanical keyboard with hot-swappable switches for gamers and typists.',
    price: 179.99,
    emoji: '⌨️',
    color: '#e91e63',
    category: 'Accessories',
    sku: 'KB-MECH-PRO',
    stock: 34,
    features: [
      'Hot-swappable switches',
      'Per-key RGB lighting',
      'Aluminum frame',
      'USB-C connection',
      'Programmable macros'
    ]
  },
  {
    id: 5,
    name: 'Webcam 4K',
    description: 'Ultra HD webcam with auto-framing and built-in ring light.',
    price: 199.99,
    emoji: '📷',
    color: '#00bcd4',
    category: 'Electronics',
    sku: 'WC-4K-PRO',
    stock: 19,
    features: [
      '4K resolution at 30fps',
      'Auto-framing AI',
      'Built-in ring light',
      'Dual noise-canceling mics',
      'Privacy shutter'
    ]
  },
  {
    id: 6,
    name: 'USB-C Hub',
    description: 'All-in-one USB-C hub with 10 ports for your workstation.',
    price: 89.99,
    emoji: '🔌',
    color: '#607d8b',
    category: 'Accessories',
    sku: 'HUB-10P-USB',
    stock: 73,
    features: [
      '10 ports in one',
      '100W power delivery',
      '4K HDMI output',
      'SD card reader',
      'Gigabit ethernet'
    ]
  }
];

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

// Helper: Get AMCV cookie name for this org
function getAmcvCookieName() {
  const orgId = process.env.ADOBE_TARGET_ORG_ID?.replace('@', '%40');
  return `AMCV_${orgId}`;
}

// Helper: Extract ECID (Marketing Cloud ID) from AMCV cookie
function getEcidFromCookie(req) {
  const amcvCookie = req.cookies[getAmcvCookieName()];
  if (!amcvCookie) return null;

  // AMCV cookie format: MCMID|<ecid>|other|values
  const mcmidMatch = amcvCookie.match(/MCMID\|([^|]+)/);
  return mcmidMatch ? mcmidMatch[1] : null;
}

// Helper: Generate ECID via demdex if not present in cookie
async function getOrCreateEcid(req, res) {
  const existingEcid = getEcidFromCookie(req);
  if (existingEcid) {
    return existingEcid;
  }

  const orgId = process.env.ADOBE_TARGET_ORG_ID;
  if (!orgId) return null;

  try {
    const demdexUrl = new URL('https://dpm.demdex.net/id');
    demdexUrl.searchParams.set('d_visid_ver', '5.0.0');
    demdexUrl.searchParams.set('d_fieldgroup', 'MC');
    demdexUrl.searchParams.set('d_rtbd', 'json');
    demdexUrl.searchParams.set('d_ver', '2');
    demdexUrl.searchParams.set('d_orgid', orgId);
    demdexUrl.searchParams.set('d_nsid', '0');

    console.log('[ECID] Generating new ECID via demdex...');
    const response = await fetch(demdexUrl.toString());
    if (!response.ok) return null;

    const data = await response.json();
    const ecid = data.d_mid;
    if (!ecid) return null;

    console.log('[ECID] Generated:', ecid);

    // Set AMCV cookie for client-side
    res.cookie(getAmcvCookieName(), `MCMID|${ecid}`, {
      maxAge: 2 * 365 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    return ecid;
  } catch (error) {
    console.error('[ECID] Error:', error.message);
    return null;
  }
}

// Helper: Get visitor payload with ECID and SDID
async function getVisitorPayload(req, res, mboxName) {
  const orgId = process.env.ADOBE_TARGET_ORG_ID;
  if (!orgId) return null;

  // Get or create ECID (via cookie or demdex)
  const ecid = await getOrCreateEcid(req, res);

  // Use Visitor SDK for SDID generation
  const visitor = new Visitor(orgId);
  const sdid = visitor.getSupplementalDataID(mboxName || 'target-global-mbox');
  const serverState = visitor.getState();

  console.log('[Visitor] Payload:', { ecid, sdid, mbox: mboxName });

  return { ecid, sdid, serverState };
}

// Helper: Send A4T display hit via Data Insertion API
async function sendA4TDisplayHit(req, res, analyticsData, pageName, visitorPayload) {
  const trackingServer = process.env.ADOBE_ANALYTICS_TRACKING_SERVER;
  const rsid = process.env.ADOBE_ANALYTICS_RSID;

  if (!trackingServer || !rsid) {
    console.warn('[A4T] Missing tracking server or RSID configuration');
    return;
  }

  const tnta = analyticsData?.analyticsPayload?.tnta;
  if (!tnta) {
    console.warn('[A4T] No TNTA token available for', analyticsData?.mboxName);
    return;
  }

  if (!visitorPayload?.ecid) {
    console.warn('[A4T] No ECID available - A4T hit not sent');
    return;
  }

  // Build Data Insertion API URL
  // Format: https://<tracking-server>/b/ss/<rsid>/0?tnta=<token>&mid=<ecid>&pageName=<page>&pe=tnt
  const params = new URLSearchParams({
    pe: 'tnt',
    tnta: tnta,
    mid: visitorPayload.ecid,
    pageName: pageName,
    events: 'event8',
    c2: `server-side-a4t|${analyticsData.mboxName}|${analyticsData.activityId || 'unknown'}`
  });

  // Include SDID for Target-Analytics stitching
  if (visitorPayload.sdid) {
    params.set('sdid', visitorPayload.sdid);
  }

  const url = `https://${trackingServer}/b/ss/${rsid}/0?${params.toString()}`;

  try {
    console.log('[A4T] Sending display hit:', url);
    const response = await fetch(url);

    if (response.ok) {
      console.log('[A4T] Display hit sent successfully for', analyticsData.mboxName);
    } else {
      console.error('[A4T] Display hit failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('[A4T] Error sending display hit:', error.message);
  }
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

  // Generate visitor payload (creates ECID for new visitors via demdex)
  const visitorPayload = await getVisitorPayload(req, res, 'homepage-hero');

  // Send A4T display hit for each mbox with analytics data
  for (const analyticsData of analytics) {
    if (analyticsData.analyticsPayload?.tnta) {
      await sendA4TDisplayHit(req, res, analyticsData, 'sst:home', visitorPayload);
    }
  }

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
    targetAnalytics: analytics,
    visitorState: visitorPayload?.serverState
  });
});

app.get('/products', async (req, res) => {
  const targetResponse = await req.getTargetOffers(['products-banner']);
  const { offers, analytics, isDemo } = targetResponse;

  // Generate visitor payload (creates ECID for new visitors via demdex)
  const visitorPayload = await getVisitorPayload(req, res, 'products-banner');

  // Send A4T display hit for each mbox with analytics data
  for (const analyticsData of analytics) {
    if (analyticsData.analyticsPayload?.tnta) {
      await sendA4TDisplayHit(req, res, analyticsData, 'sst:products', visitorPayload);
    }
  }

  const bannerContent = offers['products-banner']?.content || {
    message: 'Check out our latest products!',
    highlight: 'New Arrivals'
  };

  res.render('products', {
    title: 'Products',
    banner: bannerContent,
    products: PRODUCTS,
    isDemo,
    targetAnalytics: analytics,
    visitorState: visitorPayload?.serverState
  });
});

app.get('/products/:id', (req, res) => {
  const productId = parseInt(req.params.id);
  const product = PRODUCTS.find(p => p.id === productId);

  if (!product) {
    return res.status(404).render('404', { title: 'Product Not Found' });
  }

  // Get related products (exclude current product)
  const relatedProducts = PRODUCTS.filter(p => p.id !== productId).slice(0, 3);

  res.render('product-detail', {
    title: product.name,
    product,
    relatedProducts,
    targetAnalytics: []
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
