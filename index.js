const mqtt = require('mqtt');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config.js');
const { logger, getLastLogs } = require('./logger.js');
const telebot = new TelegramBot(config.token, { polling: true });
const client = mqtt.connect(config.mqttHost, config.mqttOptions);

// Set process timezone
process.env.TZ = config.timeZone;

const publishFeed = () => {
  logger.info('Publish ' + config.mqttPublishTopicFeed);
  client.publish(config.mqttPublishTopicFeed, Buffer.from([0x01]));
};

const publishSyncTime = () => {
  // Expected time format is 6 bytes hr, min, sec, day, month, year
  const now = new Date();
  const timeBuffer = Buffer.from([
    now.getHours(),
    now.getMinutes(),
    now.getSeconds(),
    now.getDate(),
    now.getMonth() + 1,
    now.getFullYear() - 2000,
  ]);
  logger.info(`Publish [${config.mqttPublishTopicSyncTime}]`);
  client.publish(config.mqttPublishTopicSyncTime, timeBuffer);
};

const publishSetTimers = (payload = '') => {
  // Expected payload is roughly 6 hh:mm pairs, e.g. 01:00;02:00;03:00;04:00;05:00;06:00
  const timers = payload.split(/[:;]/);

  if (timers.length !== 12) {
    return false;
  } 
  
  // Expected timers format is 6 consequential 2-bytes [hours, minutes]
  logger.info(`Publish [${config.mqttPublishTopicSetTimers}]`);
  client.publish(config.mqttPublishTopicSetTimers, Buffer.from(timers.map(Number)));
  return true;
};

const publishGetStatus = () => {
  logger.info(`Publish [${config.mqttPublishTopicGetStatus}]`);
  client.publish(config.mqttPublishTopicGetStatus, '');
};

const getCanFeed = ({ id }) => config.userIds.indexOf(id) !== -1;

const processTeleCommand = (user, command, payload) => {
  if (!getCanFeed(user)) {
    telebot.sendMessage(user.id, 'You can not feed our pet, sorry!');
    logger.warn('Intrusion alert!', user);
    return;
  }

  switch (command) {
    case 'feed':
      publishFeed();
      break;

    case 'logs':
      getLastLogs().then((logs) => {
        telebot.sendMessage(user.id, logs);
      });
      break;

    case 'get_status':
      publishGetStatus();
      telebot.sendMessage(user.id, 'Check logs whether device has answered');
      break;

    case 'set_timers':
      if (publishSetTimers(payload)) {
        telebot.sendMessage(user.id, 'Set timers ok, check logs if device was rebooted with the new timers');
      } else {
        telebot.sendMessage(user.id, 'Wrong payload given, shuold be roughly 6 timers in hh:mm;hh:mm;hh:mm;hh:mm;hh:mm;hh:mm format');
      }
      break;

    default:
      logger.warn(`Unknown command received: ${command}`);
      break;
    }
}

const processTeleMessage = (message) => {
  const { from, text } = message;
  const [match, command, payload] = text.match(/^\/(.+?)(?:\s)(.+)$/) || text.match(/^\/([_-\w]+)$/) || [null, null, null];

  logger.info(`Telegram message received: [${from.username}]: ${text}`);

  if (command) {
    processTeleCommand(from, command, payload);
  }
}

const broadcastMessage = (message) => {
  config.userIds.forEach(
    userId => telebot.sendMessage(userId, message)
  );
}

const processMqttMessage = (topic, payload) => {
  logger.info(`MQTT message received [${topic}] ${payload}`);

  switch (topic) {
    case config.mqttSubscribeTopicFeedCallback:
      broadcastMessage(payload);
      break;
    case config.mqttSubscribeTopicDebug:
      // nothing special, just save logs
      break;
    case config.mqttSubscribeTopicGetTime:
      publishSyncTime();
      break;
  }
}

client.on('connect', () => {
  logger.info('MQTT connected');
  client.subscribe([
    config.mqttSubscribeTopicFeedCallback,
    config.mqttSubscribeTopicGetTime,
    config.mqttSubscribeTopicDebug,
  ], () => logger.info('MQTT subscribed'));
});

client.on('message', processMqttMessage);

telebot.on('message', processTeleMessage);