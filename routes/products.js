const express = require('express');
const router = express.Router();
const PRODUCTS = require('../data/products');
const { getVisitorPayload, sendA4TDisplayHit } = require('../services/target');

router.get('/', async (req, res) => {
  // const targetResponse = await req.getTargetOffers(['products-banner']);
  // const { offers, analytics, isDemo } = targetResponse;

  // Generate visitor payload (creates ECID for new visitors via demdex)
  // const visitorPayload = await getVisitorPayload(req, res, 'products-banner');

  // Send A4T display hit for each mbox with analytics data
  // for (const analyticsData of analytics) {
  //   if (analyticsData.analyticsPayload?.tnta) {
  //     await sendA4TDisplayHit(req, res, analyticsData, 'sst:products', visitorPayload);
  //   }
  // }

  const bannerContent =  {
    message: 'Check out our latest products!',
    highlight: 'New Arrivals'
  };

  res.render('products', {
    title: 'Products',
    banner: bannerContent,
    products: PRODUCTS,
    // isDemo,
    // targetAnalytics: analytics,
    // visitorState: visitorPayload?.serverState
  });
});

router.get('/:id', (req, res) => {
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

module.exports = router;
