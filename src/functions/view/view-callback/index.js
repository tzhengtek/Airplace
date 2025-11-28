import functions from '@google-cloud/functions-framework';
import { z } from 'zod';
import { getSecret } from './utils/secrets_helper.js';
import { editOriginalMessage } from './utils/discord.js';
import { createLogger, Severity } from './utils/logging.js';
import { Storage } from '@google-cloud/storage';
import path from 'path';

let cachedAppId = null;
const logger = createLogger({ project: 'view-callback' });

await getSecret("discord-app-id")
    .then((key) => cachedAppId = key)
    .catch((error) => logger({ severity: Severity.ERROR, message: 'Failed to initialize app id', error: error?.stack || String(error) }));

const CommandMessageSchema = z.object({
    command: z.string().min(1),
    interactionToken: z.string().min(1),
    imagePath: z.string().min(1),
});

functions.http('viewCallback', async (req, res) => {
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
        const storage = new Storage();

        const bucketName = "serverless-epitech-view";
        const objectPath = data.imagePath;

        let files = [];

        if (bucketName && objectPath) {
            try {
                const file = storage.bucket(bucketName).file(objectPath);
                const [exists] = await file.exists();
                if (!exists) {
                    logger({ severity: Severity.WARNING, message: 'File not found', bucket: bucketName, objectPath });
                } else {
                    const contents = await file.download();
                    const buffer = contents[0];
                    let filename = path.basename(objectPath);

                    if (!/\.png$/i.test(filename)) {
                        const ext = path.extname(filename);
                        if (!ext) filename = `${filename}.png`;
                        else filename = filename.replace(/\.[^/.]+$/, '') + '.png';
                    }
                    const contentType = 'image/png';

                    files.push({ name: filename, buffer, contentType });
                    logger({ severity: Severity.INFO, message: 'Downloaded image', filename, bucket: bucketName, objectPath, size: buffer.length });
                }
            } catch (err) {
                logger({ severity: Severity.ERROR, message: 'Error downloading image from Cloud Storage', error: err?.stack || String(err) });
            }
        } else {
            logger({ severity: Severity.NOTICE, message: 'No bucket/object provided; skipping image attach.' });
        }

        const body = { content: `✅ Airplace view retrieved.` };
        if (files.length > 0) body.files = files;

        await editOriginalMessage(cachedAppId, data.interactionToken, body);
        logger({ severity: Severity.INFO, message: 'View message sent', command: data.command, interactionToken: data.interactionToken, files: files.length });
        return;
    } catch (err) {
        logger({ severity: Severity.ERROR, message: 'Error editing Discord message', error: err?.stack || String(err) });
    }
}
