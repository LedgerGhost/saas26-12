const mongoose = require('mongoose');
const { connect: rmqConnect, subscribe } = require('@saasplug/shared-utils');
const buildApp = require('./app');
const eventHandler = require('./services/eventHandler');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[analytics-service] mongo connected');

  await rmqConnect();
  await subscribe(
    'analytics-service.events',
    ['station.*', 'reservation.*', 'invoice.*', 'payment.*'],
    eventHandler
  );

  const app = buildApp();
  const port = process.env.PORT || 5006;
  app.listen(port, () => console.log(`[analytics-service] listening on :${port}`));
})().catch(err => { console.error('[analytics-service] fatal:', err); process.exit(1); });
