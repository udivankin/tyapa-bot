const mqtt = require('mqtt');
const scheduler = require('node-schedule');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config.js');
const logger = require('./logger.js');
const telebot = new TelegramBot(config.token, { polling: true });
const client = mqtt.connect(config.mqttHost, config.mqttOptions);

client.subscribe(config.mqttSubscribeSuccessTopic);
client.subscribe(config.mqttSubscribeCallbackTopic);
client.subscribe(config.mqttSubscribeFailTopic);

const feed = () => {
  logger.info('Feeding time!');
  client.publish(config.mqttPublishTopic, config.mqttPublishMessage);
};

const getCanFeed = ({ id }) => config.userIds.indexOf(id) !== -1;

const feedJob = scheduler.scheduleJob(config.schedule, feed);

const processTeleCommand = (user, command) => {
  switch (command) {
    case 'feed':
      if (getCanFeed(user)) {
        feed();
      } else {
        telebot.sendMessage(user.id, 'You can not feed our pet, sorry!');
        logger.warn('Intrusion alert!', user);
      }

      break;

    default:
      logger.warn(`Unknown command received: ${command}`);
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

const broadcastMessage = (message) => {
  config.userIds.forEach(
    userId => telebot.sendMessage(userId, message)
  );
}

const processMqttMessage = (topic, payload) => {
  let message = `${topic} : ${payload}`;

  switch (topic) {
    case config.mqttSubscribeCallbackTopic:
      message = `Feeder confirmed: ${payload}`;
      logger.info(message);
      break;
    case config.mqttSubscribeSuccessTopic:
      logger.info(`Feed detected: ${payload}`);
      break;
    case config.mqttSubscribeFailTopic:
      message = `Error: ${payload}`;
      break;
  }

  broadcastMessage(message);
}

client.on('message', processMqttMessage);
telebot.on('message', processTeleMessage);
