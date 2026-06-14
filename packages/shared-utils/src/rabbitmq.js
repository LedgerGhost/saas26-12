const amqp = require('amqplib');

const EXCHANGE = 'saasplug.events';
const EXCHANGE_TYPE = 'topic';

let connection = null;
let channel = null;

async function connect(url = process.env.RABBITMQ_URL) {
  if (channel) return channel;
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      connection = await amqp.connect(url);
      channel = await connection.createChannel();
      await channel.assertExchange(EXCHANGE, EXCHANGE_TYPE, { durable: true });

      connection.on('error', (err) => console.error('[rabbitmq] connection error:', err.message));
      connection.on('close', () => {
        console.warn('[rabbitmq] connection closed — will lazy-reconnect on next op');
        channel = null;
        connection = null;
      });
      console.log('[rabbitmq] connected');
      return channel;
    } catch (err) {
      console.warn(`[rabbitmq] connect attempt ${attempt}/${maxAttempts} failed: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error('[rabbitmq] could not connect after retries');
}

async function publish(routingKey, payload) {
  if (!channel) await connect();
  const buf = Buffer.from(JSON.stringify(payload));
  channel.publish(EXCHANGE, routingKey, buf, { contentType: 'application/json', persistent: true });
}

/**
 * Subscribe a worker to one or more routing patterns.
 *   subscribe('analytics-service', ['reservation.*', 'station.*'], handler)
 */
async function subscribe(queueName, patterns, handler) {
  if (!channel) await connect();
  await channel.assertQueue(queueName, { durable: true });
  for (const p of patterns) {
    await channel.bindQueue(queueName, EXCHANGE, p);
  }
  channel.prefetch(10);
  channel.consume(queueName, async (msg) => {
    if (!msg) return;
    try {
      const body = JSON.parse(msg.content.toString());
      await handler(msg.fields.routingKey, body);
      channel.ack(msg);
    } catch (err) {
      console.error(`[rabbitmq] handler error on ${msg.fields.routingKey}:`, err.message);
      channel.nack(msg, false, false); // dead-letter (drop)
    }
  });
  console.log(`[rabbitmq] consumer "${queueName}" bound to: ${patterns.join(', ')}`);
}

module.exports = { connect, publish, subscribe, EXCHANGE };
