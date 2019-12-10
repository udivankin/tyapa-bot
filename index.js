const mqtt = require('mqtt');
const Telegraf = require('telegraf')
const Telegram = require('telegraf/telegram')
const config = require('./config.js');
const { logger, getLastLogs } = require('./logger.js');
const telegraf = new Telegraf(config.token);
const telegram = new Telegram(config.token);
const client = mqtt.connect(config.mqttHost, config.mqttOptions);

// Set process timezone
process.env.TZ = config.timeZone;

const feedHistory = new Set();

const getCurrentTime = () => {
  const date = new Date();
  const hrs = String(date.getHours()).padStart(2, '0');
  const mns = String(date.getMinutes()).padStart(2, '0');
  return `${hrs}:${mns}`;
}

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

const checkCanFeed = (ctx) => {
  const canFeed = config.userIds.indexOf(ctx.from.id) !== -1;
  if (!canFeed) {
    ctx.reply('You can not feed our pet, sorry!');
    logger.warn('Intrusion alert!', ctx.from);
  }
  return canFeed;
};

telegraf.command('feed', (ctx) => {
  if (!checkCanFeed(ctx)) return;
  logger.info('Publish ' + config.mqttPublishTopicFeed);
  client.publish(config.mqttPublishTopicFeed, Buffer.from([0x01]));
})


telegraf.command('logs', (ctx) => {
  if (!checkCanFeed(ctx)) return;
  getLastLogs().then((logs) => {
    ctx.reply(logs);
  });
})

telegraf.command('get_status', (ctx) => {
  if (!checkCanFeed(ctx)) return;
  publishGetStatus();
  ctx.reply('Check logs whether device has answered');
})

telegraf.command('set_timers', (ctx) => {
  if (!checkCanFeed(ctx)) return;
  const payload = ctx.message.text.slice(12);

  if (publishSetTimers(payload)) {
    const response = 'Set timers ok, check logs if device was rebooted with the new timers';
    ctx.reply(response);
    logger.info(response)
  } else {
    const response = 'Wrong payload given, shuold be roughly 6 timers in hh:mm;hh:mm;hh:mm;hh:mm;hh:mm;hh:mm format';
    ctx.reply(response);
    logger.warn(response)
  }
})

telegraf.launch()
  .then(() => logger.info('Telegram bot started in polling mode'))
  .catch((e) => logger.error('Telegram bot error', e));

const broadcastMessage = (message) => {
  config.userIds.forEach(
    userId => telegram.sendMessage(userId, message)
  );
}

const processMqttMessage = (topic, payload) => {
  logger.info(`MQTT message received [${topic}] ${payload}`);

  switch (topic) {
    case config.mqttSubscribeTopicFeedCallback:
      feedHistory.add(getCurrentTime());
      broadcastMessage(`😻 ${payload}`);
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

client.on('error', () => logger.error('MQTT connection error'));

client.on('offline', () => logger.error('MQTT client offline'));

var CronJob = require('cron').CronJob;

new CronJob('0 0 * * *', function() {
  config.userIds.forEach(
    userId => telegram.sendMessage(userId, `🐈 ${feedHistory.size} meals today: ${[...feedHistory].join(' ')}`)
  );
  feedHistory.clear();
}, null, true, config.timeZone);