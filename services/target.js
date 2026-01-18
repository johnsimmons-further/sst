const TargetClient = require('@adobe/target-nodejs-sdk');
const Visitor = require('@adobe-mcid/visitor-js-server');

// Adobe Target Configuration
const targetConfig = {
  client: process.env.ADOBE_TARGET_CLIENT,
  organizationId: process.env.ADOBE_TARGET_ORG_ID,
  propertyToken: process.env.ADOBE_TARGET_PROPERTY_TOKEN,
  decisioningMethod: 'server-side',
  timeout: 5000,
  logger: {
    debug: () => {}, // Disabled - was outputting EJS compiled templates
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
    return {
      offers: mboxNames.reduce((acc, name) => {
        acc[name] = { content: null, isDemo: true };
        return acc;
      }, {}),
      analytics: [],
      isDemo: true
    };
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

        const mboxAnalytics = {
          mboxName: mbox.name,
          activityId: null,
          experienceId: null,
          analyticsPayload: null,
          responseTokens: {},
          propositionId: null,
          scopeDetailsId: null,
          eventToken: null
        };

        if (mbox.options?.[0]) {
          const option = mbox.options[0];

          if (option.eventToken) {
            mboxAnalytics.eventToken = option.eventToken;
          }

          if (option.responseTokens) {
            mboxAnalytics.responseTokens = option.responseTokens;
            mboxAnalytics.activityId = option.responseTokens['activity.id'];
            mboxAnalytics.activityName = option.responseTokens['activity.name'];
            mboxAnalytics.experienceId = option.responseTokens['experience.id'];
            mboxAnalytics.experienceName = option.responseTokens['experience.name'];
            mboxAnalytics.offerId = option.responseTokens['offer.id'];
            mboxAnalytics.offerName = option.responseTokens['offer.name'];

            if (mboxAnalytics.activityId && mboxAnalytics.experienceId !== null) {
              const propositionPayload = JSON.stringify({
                activityId: mboxAnalytics.activityId,
                experienceId: mboxAnalytics.experienceId
              });
              mboxAnalytics.propositionId = 'AT:' + Buffer.from(propositionPayload).toString('base64');

              const scopeDetailsPayload = JSON.stringify({
                activityId: mboxAnalytics.activityId,
                experienceId: mboxAnalytics.experienceId,
                targetType: '0'
              });
              mboxAnalytics.scopeDetailsId = 'AT:' + Buffer.from(scopeDetailsPayload).toString('base64');
            }
          }
        }

        if (mbox.analytics?.payload) {
          mboxAnalytics.analyticsPayload = mbox.analytics.payload;
        }

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

// Middleware to attach Target helpers to request
function targetMiddleware(req, res, next) {
  req.getTargetOffers = (mboxNames) => getTargetOffers(req, res, mboxNames);

  const mboxCookieName = TargetClient.TargetCookieName || 'mbox';
  res.locals.targetDebug = {
    mboxCookie: req.cookies[mboxCookieName] || null,
    mboxCookieName
  };

  next();
}

module.exports = {
  initializeTarget,
  getVisitorPayload,
  sendA4TDisplayHit,
  getTargetOffers,
  targetMiddleware
};
