require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');

// Services
const { initializeTarget, targetMiddleware } = require('./services/target');

// Routes
const indexRoutes = require('./routes/index');
const productsRoutes = require('./routes/products');
const pagesRoutes = require('./routes/pages');

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

// Target middleware (attaches helpers to req)
app.use(targetMiddleware);

// Mount routes
app.use('/', indexRoutes);
app.use('/products', productsRoutes);
app.use(pagesRoutes);

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
