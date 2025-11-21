import { ephemeralMessageResponse, editOriginalMessage } from './utils/discord.js';
import { publishEvent } from './utils/pub_sub.js';

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

export function handleDrawPixelCommand(pubSubClient, x, y, color, userId, appId, interactionToken) {
    try {
        const payload = {
            x: x,
            y: y,
            color: Color[color],
            user: userId,
            timestamp: new Date().toISOString()
        }
        console.log('Publishing pixel.draw event with payload:', JSON.stringify(payload));
        publishEvent(pubSubClient, "pixel.draw", JSON.stringify(payload)).then(async () => {
            await editOriginalMessage(appId, interactionToken, {
                content: `✏️✅ Pixel drawn at (**${x}**, **${y}**) with color ${ColorDisplay[color]}`
            });
        });
        return ephemeralMessageResponse(`✏️🕖 Drawing your pixel at (**${x}**, **${y}**) in ${ColorDisplay[color]}...`);
    } catch (err) {
        console.error('Failed to publish pixel.draw event:', err);
        return ephemeralMessageResponse(`❌ An error occurred while drawing your pixel at (**${x}**, **${y}**) in ${ColorDisplay[color]} 😢`);
    }
}

export function handleViewCommand(pubSubClient, appId, interactionToken) {
    try {
        return ephemeralMessageResponse(`⚙️🕖 Generating canvas view...`);
    } catch (err) {
        console.error('Failed to publish admin.snapshot event:', err);
        return ephemeralMessageResponse(`❌ An error occurred while generating canvas view 😢`);
    }
}

export function handleAdminStartCommand(pubSubClient, appId, interactionToken) {
    try {
        return ephemeralMessageResponse(`▶️🕖 Starting Airplace session...`);
    } catch (err) {
        console.error('Failed to publish admin.snapshot event:', err);
        return ephemeralMessageResponse(`❌ An error occurred while starting the Airplace session 😢`);
    }
}

export function handleAdminPauseCommand(pubSubClient, appId, interactionToken) {
    try {
        return ephemeralMessageResponse(`⏸️🕖 Pausing Airplace session...`);
    } catch (err) {
        console.error('Failed to publish admin.snapshot event:', err);
        return ephemeralMessageResponse(`❌ An error occurred while pausing the Airplace session 😢`);
    }
}

export function handleAdminResetCommand(pubSubClient, appId, interactionToken) {
    try {
        return ephemeralMessageResponse(`🔄🕖 Resetting Airplace session...`);
    } catch (err) {
        console.error('Failed to publish admin.snapshot event:', err);
        return ephemeralMessageResponse(`❌ An error occurred while resetting the Airplace session 😢`);
    }
}

export function handleAdminSnapshotCommand(pubSubClient, appId, interactionToken) {
    try {
        return ephemeralMessageResponse(`⚙️🕖 Generating snapshot image...`);
    } catch (err) {
        console.error('Failed to publish admin.snapshot event:', err);
        return ephemeralMessageResponse(`❌ An error occurred while generating the snapshot 😢`);
    }
}

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
                    max_value: 999
                },
                {
                    type: 4,
                    name: 'y',
                    description: 'Y coordinate',
                    required: true,
                    min_value: 0,
                    max_value: 999
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
