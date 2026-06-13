const buildApp = require('./app');
const port = process.env.PORT;
buildApp().listen(port, () => console.log(`[${process.env.PROVIDER_ID}-service] listening on :${port}`));
