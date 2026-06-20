const mongoose = require('mongoose');
const cron = require('node-cron');
const { connect: rmqConnect, subscribe } = require('@saasplug/shared-utils');
const buildApp = require('./app');
const eventHandler = require('./services/eventHandler');
const invoiceController = require('./controllers/invoiceController');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[billing-service] mongo connected');

  await rmqConnect();
  await subscribe(
    'billing-service.events',
    ['reservation.confirmed', 'reservation.cancelled'],
    eventHandler
  );

  // CRON JOB: Runs every 30 seconds for testing (change to '0 0 * * *' for midnight production)
  cron.schedule('*/30 * * * * *', async () => {
    await invoiceController.runAutomatedBilling();
  });

  const app = buildApp();
  const port = process.env.PORT || 5005;
  app.listen(port, () => console.log(`[billing-service] listening on :${port}`));
})().catch(err => { 
  console.error('[billing-service] fatal:', err); 
  process.exit(1); 
});
