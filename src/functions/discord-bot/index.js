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

let cachedAppId = null;
let cachedPublicKey = null;
let cachedToken = null;

await getSecret("discord-app-id").then((key) => {
    cachedAppId = key;
}).catch((error) => {
    console.error('Failed to initialize app id:', error);
});

await getSecret("discord-public-key").then((key) => {
    cachedPublicKey = key;
}).catch((error) => {
    console.error('Failed to initialize public key:', error);
});

await getSecret("discord-token").then((key) => {
    cachedToken = key;
}).catch((error) => {
    console.error('Failed to initialize token:', error);
});

registerCommands(cachedAppId, cachedToken, ALL_COMMANDS);

const pubSubClient = new PubSub();

functions.http('discordInteractions', (req, res) => {
    try {
        verifyKey(req.rawBody, req.headers['x-signature-ed25519'], req.headers['x-signature-timestamp'], cachedPublicKey);

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
                        return res.json(handleDrawPixelCommand(pubSubClient, x, y, color, userId, cachedAppId, interactionToken));
                    case 'view':
                        return res.json(handleViewCommand(pubSubClient, cachedAppId, req.body.token));
                    default:
                        console.log('Unknown subcommand:', subcommand);
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
                        console.log('Unknown admin action:', adminAction);
                        return res.status(400).json({ error: 'unknown admin action' });
                }
            }

            console.log('Unknown command:', command);
            return res.status(400).json({ error: 'unknown command' });
        }
    } catch (error) {
        console.error('Error processing request:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
