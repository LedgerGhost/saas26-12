require('./app')().then(app => {
  const port = process.env.PORT || 4000;
  app.listen(port, () => console.log(`[api-gateway] listening on :${port}`));
});
