import functions from '@google-cloud/functions-framework';
import { z } from 'zod';
import { createLogger, Severity } from './utils/logging.js';
import { publishEvent } from './utils/pub_sub.js';
import { PubSub } from '@google-cloud/pubsub';

const logger = createLogger({ project: 'command-view' });

const pubSubClient = new PubSub();

const CommandMessageSchema = z.object({
    command: z.string().min(1),
    userId: z.string().min(1),
    interactionToken: z.string().min(1)
});

functions.http('commandView', async (req, res) => {
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
    try {
        let payload = {
            userId: data.userId,
            interactionToken: data.interactionToken
        };
        publishEvent(pubSubClient, "view-make", JSON.stringify(payload));
    } catch (err) {
        logger({ severity: Severity.ERROR, message: 'Error processing command', error: err?.stack || String(err) });
    }
}
