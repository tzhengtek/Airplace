import { ephemeralMessageResponse, editOriginalMessage } from './utils/discord.js';
import { publishEvent } from './utils/pub_sub.js';
import { createLogger, Severity } from './utils/logging.js';

const logger = createLogger({ project: 'discord-commands' });

const Color = {
    'black': 0x00,
    'dim gray': 0x01,
    'dark gray': 0x02,
    'gray': 0x03,
    'white': 0x04,
    'light pink': 0x05,
    'red': 0x06,
    'crimson': 0x07,
    'dark red': 0x08,
    'maroon': 0x09,
    'orange red': 0x0A,
    'light green': 0x0B,
    'pale green': 0x0C,
    'dark green': 0x0D,
    'blue': 0x0E,
    'sky blue': 0x0F,
    'light sky blue': 0x10,
    'cyan': 0x11,
    'light purple': 0x12,
    'purple': 0x13,
    'pink': 0x14,
    'orange': 0x15,
    'yellow': 0x16,
    'brown': 0x17,
}

const ColorDisplay = {
    'black': '⚫ Black',
    'dim gray': '⬛ Dim Gray',
    'dark gray': '◾ Dark Gray',
    'gray': '◼️ Gray',
    'white': '⚪ White',
    'light pink': '🩷 Light Pink',
    'red': '🔴 Red',
    'crimson': '❤️ Crimson',
    'dark red': '🟥 Dark Red',
    'maroon': '🍷 Maroon',
    'orange red': '🟠 Orange Red',
    'light green': '🍏 Light Green',
    'pale green': '💚 Pale Green',
    'dark green': '🟩 Dark Green',
    'blue': '🔵 Blue',
    'sky blue': '💙 Sky Blue',
    'light sky blue': '🩵 Light Sky Blue',
    'cyan': '🐬 Cyan',
    'light purple': '💜 Light Purple',
    'purple': '🟣 Purple',
    'pink': '🩷 Pink',
    'orange': '🟧 Orange',
    'yellow': '🟡 Yellow',
    'brown': '🟤 Brown',
}

export function handleDrawPixelCommand(pubSubClient, x, y, color, userId, appId, interactionToken, db) {
    try {
        drawPixel(pubSubClient, x, y, color, userId, appId, interactionToken, db);
        return ephemeralMessageResponse(`✏️🕖 Drawing your pixel at (**${x}**, **${y}**) in ${ColorDisplay[color]}...`);
    } catch (err) {
        logger({ severity: Severity.ERROR, message: 'Failed to publish pixel.draw event', error: err?.stack || String(err), x, y, color, userId });
        return ephemeralMessageResponse(`❌ An error occurred while drawing your pixel at (**${x}**, **${y}**) in ${ColorDisplay[color]} 😢`);
    }
}

async function drawPixel(pubSubClient, x, y, color, userId, appId, interactionToken, db) {
    const payload = {
        x: x,
        y: y,
        color: Color[color],
        user: userId,
        timestamp: new Date().toISOString()
    };
    try {
        logger({ severity: Severity.DEBUG, message: 'Checking if user can draw pixel', x, y, color, userId });
        let session = await db.collection("sessions").doc("session_0").get();
        let session_data = session.data();
        if (session_data.status == 0) {
            await editOriginalMessage(appId, interactionToken, {
                content: `❌🤡 Airplace session is not currently active. Please try again later.`
            });
            logger({ severity: Severity.NOTICE, message: 'Draw rejected: session not active', x, y, userId });
            return;
        }
        logger({ severity: Severity.DEBUG, message: 'Checking user rate limit', user: payload.user });
        let user = await db.collection("users").doc(payload.user).get();
        let userData = user.data();
        if (user == null || userData == undefined) {
            logger({ severity: Severity.NOTICE, message: 'Skipping rate limit check: user document missing', user: payload.user });
        } else {
            const now = Date.now();
            const lastDraw = userData.lastUpdated ? userData.lastUpdated.toMillis() : 0;
            const RATE_LIMIT_MS = parseInt(process.env.RATE_LIMIT, 30) * 1000;
            if (now - lastDraw < RATE_LIMIT_MS) {
                let timeleft = Math.ceil((RATE_LIMIT_MS - (now - lastDraw)) / 1000);
                logger({ severity: Severity.WARNING, message: 'User rate limited', user: payload.user, timeleft });
                await editOriginalMessage(appId, interactionToken, {
                    content: `❌⏳ You are drawing pixels too quickly! Please wait a moment before drawing another pixel. ${timeleft} seconds remaining`
                });
                return;
            }
        }
        logger({ severity: Severity.INFO, message: 'Publishing pixel.draw event', payload });
        publishEvent(pubSubClient, "pixel.draw", JSON.stringify(payload)).then(async () => {
            await editOriginalMessage(appId, interactionToken, {
                content: `✏️✅ Pixel drawn at (**${x}**, **${y}**) with color ${ColorDisplay[color]}`
            });
            logger({ severity: Severity.INFO, message: 'Published pixel.draw and edited original message', x, y, color, user: payload.user });
        }).catch((err) => {
            logger({ severity: Severity.ERROR, message: 'Failed publishing pixel.draw', error: err?.stack || String(err), payload });
        });
    } catch (err) {
        logger({ severity: Severity.ERROR, message: 'Error checking session status', error: err?.stack || String(err), x, y, userId });
        await editOriginalMessage(appId, interactionToken, {
            content: `❌ An error occurred while checking the session status. Please try again later.`
        });
    }
}

export function handleViewCommand(pubSubClient, appId, userId, interactionToken) {
    try {
        let payload = {
            command: "view",
            userId: userId,
            interactionToken: interactionToken
        };
        logger({ severity: Severity.INFO, message: 'Publishing command.queue event', payload: { command: 'view', interactionToken } });
        publishEvent(pubSubClient, "command.queue", JSON.stringify(payload), { command: "view" });
        return ephemeralMessageResponse(`⚙️🕖 Generating canvas view...`);
    } catch (err) {
        logger({ severity: Severity.ERROR, message: 'Failed to publish command.queue event', error: err?.stack || String(err), command: 'view' });
        return ephemeralMessageResponse(`❌ An error occurred while generating canvas view 😢`);
    }
}

export function handleAdminStartCommand(pubSubClient, appId, interactionToken) {
    try {
        let payload = {
            command: "start",
            interactionToken: interactionToken
        };
        logger({ severity: Severity.INFO, message: 'Publishing command.queue event', payload: { command: 'start', interactionToken } });
        publishEvent(pubSubClient, "command.queue", JSON.stringify(payload), { command: "start" });
        return ephemeralMessageResponse(`▶️🕖 Starting Airplace session...`);
    } catch (err) {
        logger({ severity: Severity.ERROR, message: 'Failed to publish command.queue event', error: err?.stack || String(err), command: 'start' });
        return ephemeralMessageResponse(`❌ An error occurred while starting the Airplace session 😢`);
    }
}

export function handleAdminPauseCommand(pubSubClient, appId, interactionToken) {
    try {
        let payload = {
            command: "stop",
            interactionToken: interactionToken
        };
        logger({ severity: Severity.INFO, message: 'Publishing command.queue event', payload: { command: 'stop', interactionToken } });
        publishEvent(pubSubClient, "command.queue", JSON.stringify(payload), { command: "stop" });
        return ephemeralMessageResponse(`⏸️🕖 Pausing Airplace session...`);
    } catch (err) {
        logger({ severity: Severity.ERROR, message: 'Failed to publish command.queue event', error: err?.stack || String(err), command: 'stop' });
        return ephemeralMessageResponse(`❌ An error occurred while pausing the Airplace session 😢`);
    }
}

export function handleAdminResetCommand(pubSubClient, appId, interactionToken) {
    try {
        let payload = {
            command: "reset",
            interactionToken: interactionToken
        };
        logger({ severity: Severity.INFO, message: 'Publishing command.queue event', payload: { command: 'reset', interactionToken } });
        publishEvent(pubSubClient, "command.queue", JSON.stringify(payload), { command: "reset" });
        return ephemeralMessageResponse(`🔄🕖 Resetting Airplace session...`);
    } catch (err) {
        logger({ severity: Severity.ERROR, message: 'Failed to publish command.queue event', error: err?.stack || String(err), command: 'reset' });
        return ephemeralMessageResponse(`❌ An error occurred while resetting the Airplace session 😢`);
    }
}

export function handleAdminSnapshotCommand(pubSubClient, appId, interactionToken) {
    try {
        let payload = {
            command: "snapshot",
            interactionToken: interactionToken
        };
        logger({ severity: Severity.INFO, message: 'Publishing command.queue event', payload: { command: 'snapshot', interactionToken } });
        publishEvent(pubSubClient, "command.queue", JSON.stringify(payload), { command: "snapshot" });
        return ephemeralMessageResponse(`⚙️🕖 Getting snapshot image...`);
    } catch (err) {
        logger({ severity: Severity.ERROR, message: 'Failed to publish command.queue event', error: err?.stack || String(err), command: 'snapshot' });
        return ephemeralMessageResponse(`❌ An error occurred while generating the snapshot 😢`);
    }
}

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE, 10);

const AIRPLACE_COMMAND = {
    name: 'airplace',
    description: 'Airplace game commands',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    options: [
        {
            type: 1,
            name: 'draw',
            description: 'Draw a pixel on the canvas',
            options: [
                {
                    type: 4,
                    name: 'x',
                    description: 'X coordinate',
                    required: true,
                    min_value: 0,
                    max_value: 99
                },
                {
                    type: 4,
                    name: 'y',
                    description: 'Y coordinate',
                    required: true,
                    min_value: 0,
                    max_value: 99
                },
                {
                    type: 3,
                    name: 'color',
                    description: 'Choose a color',
                    required: true,
                    choices: [
                        { name: '⚫ Black', value: 'black' },
                        { name: '⬛ Dim Gray', value: 'dim gray' },
                        { name: '◾ Dark Gray', value: 'dark gray' },
                        { name: '◼️ Gray', value: 'gray' },
                        { name: '⚪ White', value: 'white' },
                        { name: '🩷 Light Pink', value: 'light pink' },
                        { name: '🔴 Red', value: 'red' },
                        { name: '❤️ Crimson', value: 'crimson' },
                        { name: '🟥 Dark Red', value: 'dark red' },
                        { name: '🍷 Maroon', value: 'maroon' },
                        { name: '🟠 Orange Red', value: 'orange red' },
                        { name: '🍏 Light Green', value: 'light green' },
                        { name: '💚 Pale Green', value: 'pale green' },
                        { name: '🟩 Dark Green', value: 'dark green' },
                        { name: '🔵 Blue', value: 'blue' },
                        { name: '💙 Sky Blue', value: 'sky blue' },
                        { name: '🩵 Light Sky Blue', value: 'light sky blue' },
                        { name: '🐬 Cyan', value: 'cyan' },
                        { name: '💜 Light Purple', value: 'light purple' },
                        { name: '🟣 Purple', value: 'purple' },
                        { name: '🩷 Pink', value: 'pink' },
                        { name: '🟧 Orange', value: 'orange' },
                        { name: '🟡 Yellow', value: 'yellow' },
                        { name: '🟤 Brown', value: 'brown' }
                    ]
                }
            ]
        },
        {
            type: 1,
            name: 'view',
            description: 'Get the current canvas state'
        }
    ]
};

const AIRPLACE_ADMIN_COMMAND = {
    name: 'airplace-admin',
    description: 'Airplace admin commands',
    type: 1,
    integration_types: [0, 1],
    contexts: [0, 1, 2],
    options: [
        {
            type: 1,
            name: 'start',
            description: 'Start the game'
        },
        {
            type: 1,
            name: 'pause',
            description: 'Pause the game'
        },
        {
            type: 1,
            name: 'reset',
            description: 'Reset the game'
        },
        {
            type: 1,
            name: 'snapshot',
            description: 'Take a snapshot of the canvas'
        }
    ]
};

export const ALL_COMMANDS = [AIRPLACE_COMMAND, AIRPLACE_ADMIN_COMMAND];
