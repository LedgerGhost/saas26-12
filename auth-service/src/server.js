const mongoose = require('mongoose');
const buildApp = require('./app');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[auth-service] mongo connected');
  const app = buildApp();
  const port = process.env.PORT || 5001;
  app.listen(port, () => console.log(`[auth-service] listening on :${port}`));
})().catch(err => {
  console.error('[auth-service] fatal:', err);
  process.exit(1);
});
