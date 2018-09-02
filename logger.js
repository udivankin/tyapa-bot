const path = require('path');
const log4js = require('log4js');

log4js.configure({
  appenders: {
    stdout: { type: 'stdout' },
    eventLog: { type: 'file', filename: path.resolve(__dirname, '../logs/event.log') },
  },
  categories: {
    default: { appenders: ['stdout'], level: 'debug' },
    event: { appenders: ['stdout', 'eventLog'], level: 'info' },
    error: { appenders: ['stdout', 'eventLog'], level: 'error' },
  }
});

module.exports = {
  logger: log4js.getLogger('event'),
};
