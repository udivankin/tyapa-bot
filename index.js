const mqtt = require('mqtt');
const schedule = require('node-schedule');
const TelegramBot = require('node-telegram-bot-api');
const config = require('./config.js');
const logger = require('./logger.js');
const telebot = new TelegramBot(config.token, { polling: true });
const client = mqtt.connect(config.mqttHost, config.mqttOptions);

const feed = () => {
  config.userIds.forEach(
    userId => telebot.sendMessage(userId, 'Yum yum yum!')
  );
  client.publish('inTopic', '1');
};

const getCanFeed = ({ id }) => config.userIds.indexOf(id) !== -1;

const sendJob = schedule.scheduleJob('* */4 * * *', feed);

const processCommand = (user, command) => {
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

const processMessage = (message) => {
  const { from, text } = message;
  const command = text.match(/\/(.+)/);

  logger.info('Message received:', from.username, text);

  if (command) {
    processCommand(from, command.pop());
  }
}

telebot.on('message', processMessage);
