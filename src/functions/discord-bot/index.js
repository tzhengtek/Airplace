import functions from '@google-cloud/functions-framework';
import {
    verifyKey,
    InteractionType,
    InteractionResponseType,
    InteractionResponseFlags,
    MessageComponentTypes,
} from 'discord-interactions';
import { getSecret } from './utils/secrets_helper.js';
import { registerCommands } from './utils/discord.js';
import { PubSub } from '@google-cloud/pubsub';
import {
    handleDrawPixelCommand,
    handleViewCommand,
    handleAdminStartCommand,
    handleAdminPauseCommand,
    handleAdminResetCommand,
    handleAdminSnapshotCommand,
    ALL_COMMANDS
} from './commands.js';
import { ephemeralMessageResponse } from './utils/discord.js';
import nacl from 'tweetnacl';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createLogger, Severity } from './utils/logging.js';

const logger = createLogger({ project: 'discord-interactions' });

let app = initializeApp({
    credential: applicationDefault()
});
const db = getFirestore(app, process.env.FIRESTORE_DATABASE);

let cachedAppId = null;
let cachedPublicKey = null;
let cachedToken = null;

await getSecret("discord-app-id").then((key) => {
    cachedAppId = key;
}).catch((error) => {
    logger({ severity: Severity.ERROR, message: 'Failed to initialize app id', error: error?.stack || String(error) });
});

await getSecret("discord-public-key").then((key) => {
    cachedPublicKey = key;
}).catch((error) => {
    logger({ severity: Severity.ERROR, message: 'Failed to initialize public key', error: error?.stack || String(error) });
});

await getSecret("discord-token").then((key) => {
    cachedToken = key;
}).catch((error) => {
    logger({ severity: Severity.ERROR, message: 'Failed to initialize token', error: error?.stack || String(error) });
});

registerCommands(cachedAppId, cachedToken, ALL_COMMANDS);

const pubSubClient = new PubSub();

functions.http('discordInteractions', (req, res) => {
    try {
        const signature = req.get("X-Signature-Ed25519");
        const timestamp = req.get("X-Signature-Timestamp");
        const body = req.rawBody;

        const isVerified = nacl.sign.detached.verify(
            Buffer.from(timestamp + body),
            Buffer.from(signature, "hex"),
            Buffer.from(cachedPublicKey, "hex")
        );

        if (!isVerified) {
            return res.status(401).end("invalid request signature");
        }

        const { type, data } = req.body || {};

        if (type === InteractionType.PING)
            return res.json({ type: InteractionResponseType.PONG });

        if (type === InteractionType.APPLICATION_COMMAND) {
            const { name, options } = data || {};

            if (name === "airplace") {
                const subcommand = options?.[0];
                const subcommandName = subcommand?.name;
                const userId = req.body.member?.user?.id || req.body.user?.id;
                const interactionToken = req.body.token;

                switch (subcommandName) {
                    case 'draw':
                        const drawOptions = subcommand.options || [];
                        const x = drawOptions.find(opt => opt.name === 'x')?.value;
                        const y = drawOptions.find(opt => opt.name === 'y')?.value;
                        const color = drawOptions.find(opt => opt.name === 'color')?.value;
                        return res.json(handleDrawPixelCommand(pubSubClient, x, y, color, userId, cachedAppId, interactionToken, db));
                    case 'view':
                        return res.json(handleViewCommand(pubSubClient, cachedAppId, userId, interactionToken));
                    default:
                        logger({ severity: Severity.WARNING, message: 'Unknown subcommand', subcommand: subcommandName ?? subcommand?.name ?? subcommand });
                        return res.json(ephemeralMessageResponse(`❌ Unknown subcommand 😢`));
                }
            }

            if (name == "airplace-admin") {
                const subcommand = options?.[0];
                const subcommandName = subcommand?.name;
                const interactionToken = req.body.token;

                switch (subcommandName) {
                    case 'start':
                        return res.json(handleAdminStartCommand(pubSubClient, cachedAppId, interactionToken));
                    case 'pause':
                        return res.json(handleAdminPauseCommand(pubSubClient, cachedAppId, interactionToken));
                    case 'reset':
                        return res.json(handleAdminResetCommand(pubSubClient, cachedAppId, interactionToken));
                    case 'snapshot':
                        return res.json(handleAdminSnapshotCommand(pubSubClient, cachedAppId, interactionToken));
                    default:
                        logger({ severity: Severity.WARNING, message: 'Unknown admin action', subcommand: subcommandName });
                        return res.status(400).json({ error: 'unknown admin action' });
                }
            }

            logger({ severity: Severity.WARNING, message: 'Unknown command', commandName: name });
            return res.status(400).json({ error: 'unknown command' });
        }
    } catch (error) {
        logger({ severity: Severity.ERROR, message: 'Error processing request', error: error?.stack || String(error) });
        return res.status(500).json({ error: 'Internal server error' });
    }
});
