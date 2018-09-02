const log4js = require('log4js');
const readLastLines = require('read-last-lines');

const filename = `${__dirname}/logs/event.log`;

log4js.configure({
  appenders: {
    stdout: { type: 'stdout' },
    main: { type: 'file', filename },
  },
  categories: {
    default: { appenders: ['stdout', 'main'], level: 'debug' },
  }
});

module.exports = {
  getLastLogs: (count = 100) => readLastLines.read(filename, count),
  logger: log4js.getLogger('main'),
};
