import {
    ApolloClient,
    createHttpLink, gql,
    InMemoryCache
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { MongoClient, Db } from 'mongodb';
import fetch from 'node-fetch';
import {
    setInterval
} from 'timers/promises';
import * as https from 'https';
import * as jwt from 'jsonwebtoken';
import * as admin from 'firebase-admin';
import { nanoid } from 'nanoid';
import * as dotenv from 'dotenv';
import * as cron from 'node-cron';

dotenv.config();

const URI = `mongodb://${process.env.MONGODB_USER}:${process.env.MONGODB_PASS}@${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}`;
const tenMinutes = 1000 * 60 * 10;
const tenDays = 1000 * 60 * 1440 * 10;

const forgeToken = async (): Promise<string> => {
    const client = new MongoClient(URI, {});
    try {
        await client.connect();
        const db = client.db(process.env.MONGODB_NAME);
        const user = await db.collection('users').findOne({ email: process.env.DEFAULT_EMAIL });
        const token = jwt.sign(
            {
                'https://hasura.io/jwt/claims': {
                    'x-hasura-allowed-roles': [user.role],
                    'x-hasura-default-role': user.role,
                    'x-hasura-user-id': user._id,
                },
                user: user,
            },
            process.env.JWT_SECRET
        );
        return token;
    } catch (error) {
        console.error(error);
    }
};

const fetchHijackUpdates = async () => {
    const jwt: string = await forgeToken();

    const agent = new https.Agent({
        rejectUnauthorized: false,
    })
    const authLink = setContext(async (_, { headers }) => {
        return {
            headers: {
                ...headers,
                authorization: jwt ? `Bearer ${jwt}` : '',
            },
        };
    })
    const httpLink =
        createHttpLink({
            uri: `https://localhost/api/graphql`,
            fetch,
            fetchOptions: {
                agent: agent
            },
            useGETForQueries: false,
        });


    const client = new ApolloClient({
        link: authLink.concat(httpLink),
        cache: new InMemoryCache(),
    });

    // Clear hj_notifications every day at 00:00
    cron.schedule('0 0 * * *', async function () {
        await clearHjNotificationsDb();
    });

    for await (const startTime of setInterval(10000, Date.now())) {
        const date = new Date();
        console.log((date.getTime() - startTime) / 10000);
        date.setSeconds(date.getSeconds() - 10);

        const query = gql`
        query hijacks {
        view_hijacks(
            order_by: {time_last: desc}, where: {time_detected: {_gte: "${date.toISOString()}"}}
        ) {
            active
            comment
            configured_prefix
            hijack_as
            ignored
            dormant
            key
            rpki_status
            mitigation_started
            num_asns_inf
            num_peers_seen
            outdated
            peers_seen
            peers_withdrawn
            prefix
            resolved
            seen
            time_detected
            time_ended
            time_last
            time_started
            timestamp_of_config
            type
            under_mitigation
            withdrawn
        }
        }`;
        const result = await client.query({
            query,
        });
        const hijacks = result.data.view_hijacks;

        hijacks.forEach(hijack => {
            const key = hijack.key;
            sendNotificationFillDbEntries(key);
        });
    }
}
const clearHjNotificationsDb = async (): Promise<void> => {
    const client = new MongoClient(URI, {});
    try {
        await client.connect();
        const db = client.db('artemis-web');
        if (!(await isInCollection(db, 'hj_notifications'))) {
            return;
        }
        //delete entries with timestamp more than ten days ago
        await db.collection('hj_notifications').deleteMany({timestamp: {$lt: new Date(Date.now() - tenDays)}});
    } catch (e) {
        console.error('error', e);
        client.close();
    }
}

const sendNotification = async (hijackKey: string, hjRandom: string) => {
    console.log(`Sending notification for hijack ${hijackKey}...`);
    //@todo add path to service account file
    if (!admin.apps.length) {
        const serviceAccount = await import(process.env.SERVICE_ACCOUNT_PATH); // eslint-disable-line no-var-requires
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    }

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

const isInCollection = async (db: Db, name: string): Promise<boolean> => {
    const collections = await db.listCollections().toArray();

    return collections.some((collection) => collection.name === name);
}

const fillDbEntries = async (hijackKey: string, hjRandom: string): Promise<void> => {
    // console.info(`Filling DB entries for hijack ${hijackKey}...`);

    const client = new MongoClient(URI, {});
    try {
        await client.connect();
        const db = client.db('artemis-web');
        if (!(await isInCollection(db, 'hj_notifications'))) {
            db.createCollection('hj_notifications', function (err) {
                if (err) throw err;
            });
        }

        const users = await db.collection('users').find().toArray();
        if (users.length) {
            db.collection('hj_notifications').insertMany(
                users.map(function (user) {
                    return {
                        hijackKey: hijackKey,
                        userId: user._id,
                        notificationReceived: false,
                        smsStatusCode: -3, // sms status codes(-3: unknown, -2 rejected, -1: accepted, 0: Not sent, 1: Sent, 2: Received)
                        hjRandom: hjRandom,
                        timestamp: new Date(),
                        mobilePhone: user.mobilePhone
                    }
                }),
                (err) => {
                    console.error('error', err);
                    client.close();
                }
            );
            //after a period of time(20 minutes) check who didn't receive the notification and send the sms
            await new Promise(resolve => setTimeout(resolve, tenMinutes * 2));
            await sendSMS(hijackKey);
        }
        // console.log(`Filling DB entries for hijack ${hijackKey} finished`);
    } catch (e) {
        console.error('error', e);
        client.close();
    }
}

const sendSMS = async (hijackKey: string): Promise<void> => {
    const client = new MongoClient(URI, {});
    try {
        await client.connect();
        const db = client.db('artemis-web');
        if (!(await isInCollection(db, 'hj_notifications'))) {
            return;
        }

        // get only the mobile phone numbers of the users that did not receive the notification
        const mobilePhones = await db.collection('hj_notifications').find({
            timestamp: {$lt: new Date(Date.now() - tenMinutes * 2)},
            hijackKey: hijackKey,
            notificationReceived: false
        }).project({mobilePhone: 1, _id: 0}).map(doc => doc.mobilePhone).toArray();
        let resp = null;
        if (mobilePhones.length) {
            console.log(`Sending sms to: ${mobilePhones} for hijack: ${hijackKey}`);
            // construct the sms text
            const smsText = `Active hijack detected. Hijack key: ${hijackKey}`;

            // compose and send sms request
            const url = `https://${process.env.SMS_USERNAME}:${process.env.SMS_PASSWORD}@www.prosms.gr/secure/api/index.php?originator=${process.env.SMS_ORIGINATOR}&text=${urlEncodeSMSText(smsText)}&request_delivery=true&mobile_number=${mobilePhones.join(',')}`;
            // send the actual sms request to prosms
            resp = await fetch(url);

            if (resp.status == 200) {
                await fillAcceptanceStatuses(parseBulkAcceptanceResp(mobilePhones, await resp.text()), hijackKey);
                // After 2 minutes get the delivery reports
                await new Promise(resolve => setTimeout(resolve, tenMinutes * 2));
                await getDlr();
            } else {
                console.error('error sending sms', resp);
            }
        }
    } catch (e) {
        console.error('error', e);
        client.close();
        return;
    }
}

const parseBulkAcceptanceResp = (mobileNumbers: number[], resp: string): { mobilePhone: number, messageId: number, acceptanceStatus: number }[] => {
    resp = resp.replace(/\s+/g, '');
    const acceptanceResps = resp.split('|');
    const parsedAcceptanceStatuses = [];
    for (let i = 0; i < acceptanceResps.length; i++) {
        if (i % 2 == 1) {
            let status = -2;
            if (parseInt(acceptanceResps[i - 1]) == 1) {
                status = -1;
            } else {
                console.warn(`sms rejected with status code: ${acceptanceResps[i - 1]}, for message id :${acceptanceResps[i]}`);
            }
            parsedAcceptanceStatuses.push({
                mobilePhone: mobileNumbers[Math.floor(i / 2)],
                messageId: acceptanceResps[i],
                acceptanceStatus: status
            });
        }
    }
    return parsedAcceptanceStatuses;
}

const fillAcceptanceStatuses = async (parsedResp: { mobilePhone: number, messageId: number, acceptanceStatus: number }[], hijackKey: string): Promise<void> => {
    const client = new MongoClient(URI, {});
    try {
        await client.connect();
        const db = client.db('artemis-web');
        for (const resp of parsedResp) {
            await db.collection('hj_notifications').updateOne(
                {hijackKey: hijackKey, mobilePhone: resp.mobilePhone},
                {
                    $set: {
                        smsStatusCode: resp.acceptanceStatus,
                        smsId: resp.messageId
                    },
                }
            );
        }
    } catch (e) {
        console.error('error', e);
        client.close();
    }
}

const getDlr = async (): Promise<void> => {
    console.log('Getting delivery reports...');
    const client = new MongoClient(URI, {});
    let resp = null;
    try {
        await client.connect();
        const db = client.db('artemis-web');
        const url = `https://${process.env.SMS_USERNAME}:${process.env.SMS_PASSWORD}@www.prosms.gr/secure/api/index.php?get_status`;

        // send the request to prosms to get the dlr statuses that changed
        resp = await fetch(url);
        if (resp.status == 200) {
            const dlrStatuses = parseDlrStatuses(await resp.text());
            for (const dlrStatus of dlrStatuses) {
                await db.collection('hj_notifications').updateOne(
                    {smsId: dlrStatus.messageId},
                    {
                        $set: {
                            smsStatusCode: dlrStatus.dlrStatus,
                        },
                    }
                );
            }
        } else {
          console.error('error getting dlr response: ', resp);
        }
        console.log('Getting delivery reports finished...');
    } catch (e) {
        console.error('error', e);
        client.close();
    }
}

const parseDlrStatuses = (resp: string): { messageId: number, dlrStatus: number }[] => {
    const acceptanceResps = resp.split('|');
    const parsedDlrStatuses = [];
    let dlrStatus;
    for (let i = 0; i < acceptanceResps.length; i++) {
        if (i % 2 == 1) {
            if (acceptanceResps[i] == 'f') {
                dlrStatus = 0;
            } else if (acceptanceResps[i] == 's') {
                dlrStatus = 1;
            } else {
                dlrStatus = 2;
            }
            parsedDlrStatuses.push({messageId: acceptanceResps[i - 1], dlrStatus: dlrStatus});
        }
    }
    return parsedDlrStatuses;
}

const urlEncodeSMSText = (smsText: string) => {
    //the most common characters with their url encoding
    const characters = ['&', '+', '%', '#', ' ', '=', '?', ';', '\n'];
    const urlEncodedCharacters = ['%26', '%2B', '%25', '%23', '%20', '%3D', '%3F', '%3B', '%0D'];
    return Array.from(smsText).map(character => {
        if (characters.includes(character)) {
            return urlEncodedCharacters.at(characters.indexOf(character));
        }
        return character
    }).join('');
}

const sendNotificationFillDbEntries = async (hijackKey: string) => {
    const hjRandom = nanoid(12);
    await sendNotification(hijackKey, hjRandom);
    await fillDbEntries(hijackKey, hjRandom);
}

fetchHijackUpdates();
