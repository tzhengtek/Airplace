import functions from '@google-cloud/functions-framework';
import { z } from 'zod';
import { getSecret } from './utils/secrets_helper.js';
import { editOriginalMessage } from './utils/discord.js';
import { createLogger, Severity } from './utils/logging.js';

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let app = initializeApp({
    credential: applicationDefault()
});
const db = getFirestore(app, process.env.FIRESTORE_DATABASE);

let cachedAppId = null;

const logger = createLogger({ project: 'command-stop' });

await getSecret("discord-app-id")
    .then((key) => cachedAppId = key)
    .catch((error) => logger({ severity: Severity.ERROR, message: 'Failed to initialize app id', error: error?.stack || String(error) }));

const OptionSchema = z.object({
    name: z.string(),
    value: z.union([z.string(), z.number()]).default([]),
});

const CommandMessageSchema = z.object({
    command: z.string().min(1),
    interactionToken: z.string().min(1),
    options: z.array(OptionSchema).optional(),
});

functions.http('commandStop', async (req, res) => {
    const encodedData = req.body?.message?.data;
    if (!encodedData) return res.status(400).send('Bad Request: No message data found');

    let decodedData;
    try {
        decodedData = Buffer.from(encodedData, 'base64').toString('utf-8');
        const rawData = JSON.parse(decodedData);
        const data = CommandMessageSchema.parse(rawData);

        await processCommand(data);

        return res.status(200).send('OK');
    } catch (err) {
        if (err instanceof z.ZodError) {
            logger({ severity: Severity.WARNING, message: 'Validation error', errors: err.errors });
            return res.status(400).send(`Bad Request: ${err.errors.map(e => e.message).join(', ')}`);
        }
        logger({ severity: Severity.ERROR, message: 'Failed to parse message data as JSON', error: err?.stack || String(err) });
        return res.status(400).send('Bad Request: Invalid message data');
    }
});

async function processCommand(data) {
    logger({ severity: Severity.INFO, message: 'Processing command', command: data.command });

    let session = await db.collection("sessions").doc("session_0").get();
    let session_data = session.data();

    try {
        if (session_data.status == 0) {
            await editOriginalMessage(cachedAppId, data.interactionToken, {
                content: `⏸️🤡 Airplace session is already paused.`
            });
            logger({ severity: Severity.NOTICE, message: 'Stop requested but session already paused', command: data.command, interactionToken: data.interactionToken });
            return;
        } else {
            session_data.status = 0;
            await db.collection("sessions").doc("session_0").set(session_data);
            await editOriginalMessage(cachedAppId, data.interactionToken, {
                content: `⏸️✅ Airplace session paused.`
            });
            logger({ severity: Severity.INFO, message: 'Session paused', command: data.command, interactionToken: data.interactionToken });
            return;
        }
    } catch (err) {
        logger({ severity: Severity.ERROR, message: 'Error editing Discord message', error: err?.stack || String(err) });
    }
}
