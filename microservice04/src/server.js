const mongoose = require('mongoose');
const { connect: rmqConnect, subscribe } = require('@saasplug/shared-utils');
const buildApp = require('./app');
const eventHandler = require('./services/eventHandler');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[stations-service] mongo connected');
  await rmqConnect();

  // Listen for reservation outcomes so we can keep station status fresh.
  await subscribe(
    'stations-service.events',
    ['reservation.confirmed', 'reservation.rejected'],
    eventHandler
  );

  const app = buildApp();
  const port = process.env.PORT || 5003;
  app.listen(port, () => console.log(`[stations-service] listening on :${port}`));
})().catch(err => { console.error('[stations-service] fatal:', err); process.exit(1); });
