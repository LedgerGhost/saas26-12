const buildApp = require('./app');
const port = process.env.PORT || 5007;
buildApp().listen(port, () => console.log(`[provider-orchestrator] listening on :${port}`));
