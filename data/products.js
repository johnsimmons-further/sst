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

module.exports = PRODUCTS;
