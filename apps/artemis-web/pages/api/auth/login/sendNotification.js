// require('dotenv').config();
const URI = `mongodb://admin:pass@localhost:27017`;
// const URI = `mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}`;

function sendNotification(hijackKey, hjRandom) {
  console.log(`Sending notification for hijack ${hijackKey}...`);
  let admin = require("firebase-admin");
  //@todo add path to service account file
  let serviceAccount = require("serviceAccountFilePath");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  const topic = 'hjtopic';
  const message = {
    data: {
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
      hjKey: hijackKey,
      hjRandom: hjRandom
    },
    notification: {
      title: 'Active Hijack detected!',
      body: 'Tap to view more'
    },
    topic: topic
  };

  // Send a message to devices subscribed to the provided topic.
  admin.messaging().send(message)
    .then((response) => {
      // Response is a message ID string.
      console.log('Successfully sent message:', response);
    })
    .catch((error) => {
      console.log('Error sending message:', error);
    });
  console.log(`Sending notification for hijack ${hijackKey} finished`);
}

async function isInCollection(db, name) {
  const collections = await db.listCollections().toArray();
  const filtered = collections.filter((collection) => collection.name === name);
  return filtered.length > 0;
}

async function fillDbEntries(hijackKey, hjRandom) {
  console.log(`Filling DB entries for hijack ${hijackKey}...`);
  const {MongoClient} = require('mongodb');


  const client = new MongoClient(URI, {});
  try {
    await client.connect();

    const db = client.db('artemis-web');
    if (!(await isInCollection(db, 'hj_notifications'))) {
      db.createCollection('hj_notifications', function (err, res) {
        if (err) throw err;
      });
    }
    const users = await db.collection('users').find().toArray();
    if (users.length !== 0) {

      db.collection('hj_notifications').insertMany(
        users.map(function (user) {
          return {
            hijackKey: hijackKey,
            userId: user._id,
            notificationReceived: false,
            smsStatusCode: 0, // sms status codes(0: Not sent, 1: Sent, 2: Received)
            hjRandom: hjRandom
          }
        }),
        (err, res) => {
          console.error('error', err);
          client.close();
        }
      );
    }
  } catch (e) {
    console.error('error', e);
    client.close();
  }
  console.log(`Filling DB entries for hijack ${hijackKey} finished`);
}

async function sendNotificationFillDbEntries(hijackKey) {
  const {nanoid} = require('nanoid');
  let hjRandom = nanoid(12);
  await sendNotification(hijackKey, hjRandom);
  await fillDbEntries(hijackKey, hjRandom);
}

(async function test() {
  //@todo add hijack key
  await sendNotificationFillDbEntries('hijackKey1');
})();
