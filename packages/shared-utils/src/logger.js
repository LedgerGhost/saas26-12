function logger(serviceName) {
  const fmt = (lvl, msg, extra) => {
    const ts = new Date().toISOString();
    const line = `${ts} [${serviceName}] ${lvl} ${msg}`;
    if (extra !== undefined) console.log(line, extra);
    else console.log(line);
  };
  return {
    info:  (m, e) => fmt('INFO',  m, e),
    warn:  (m, e) => fmt('WARN',  m, e),
    error: (m, e) => fmt('ERROR', m, e)
  };
}

module.exports = { logger };
