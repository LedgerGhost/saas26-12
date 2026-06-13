const mongoose = require('mongoose');
const { connect: rmqConnect } = require('@saasplug/shared-utils');
const buildApp = require('./app');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[reservation-service] mongo connected');
  await rmqConnect();
  const app = buildApp();
  const port = process.env.PORT || 5004;
  app.listen(port, () => console.log(`[reservation-service] listening on :${port}`));
})().catch(err => { console.error('[reservation-service] fatal:', err); process.exit(1); });
