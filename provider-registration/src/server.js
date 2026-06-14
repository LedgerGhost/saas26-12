const mongoose = require('mongoose');
const buildApp = require('./app');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[provider-service] mongo connected');
  const app = buildApp();
  const port = process.env.PORT || 5002;
  app.listen(port, () => console.log(`[provider-service] listening on :${port}`));
})().catch(err => {
  console.error('[provider-service] fatal:', err);
  process.exit(1);
});
