const mqtt = require('mqtt');
const { CronJob } = require('cron');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config.js');
const logger = require('./logger.js');
const telebot = new TelegramBot(config.token, { polling: true });
const client = mqtt.connect(config.mqttHost, config.mqttOptions);

client.subscribe(config.mqttSubscribeTopic);

const feed = () => {
  client.publish(config.mqttPublishTopic, config.mqttPublishMessage);
};

const getCanFeed = ({ id }) => config.userIds.indexOf(id) !== -1;

const feedJob = new CronJob(config.schedule, feed, null, null, config.timeZone);

const processTeleCommand = (user, command) => {
  switch (command) {
    case 'feed':
      if (getCanFeed(user)) {
        feed();
      } else {
        telebot.sendMessage(user.id, 'You can not feed our pet, sorry!');
        logger.warn('Intrusion alert!', user, command);
      }

      break;

    default:
      logger.warn('Unknown command received:', command);
      break;
    }
}

const processTeleMessage = (message) => {
  const { from, text } = message;
  const command = text.match(/\/(.+)/);

  logger.info('Message received:', from.username, text);

  if (command) {
    processTeleCommand(from, command.pop());
  }
}

const processMqttMessage = (topic, message) => {
  config.userIds.forEach(
    userId => telebot.sendMessage(userId, message)
  );
}

client.on('message', processMqttMessage);
telebot.on('message', processTeleMessage);
