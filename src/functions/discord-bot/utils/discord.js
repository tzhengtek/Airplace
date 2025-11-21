import {
    InteractionResponseType,
    InteractionResponseFlags,
} from 'discord-interactions';

export async function discordRequest(endpoint, token, options) {
    const url = 'https://discord.com/api/v10/' + endpoint;

    if (options.body) options.body = JSON.stringify(options.body);
    const res = await fetch(url, {
        headers: {
            Authorization: `Bot ${token}`,
            'Content-Type': 'application/json; charset=UTF-8'
        },
        ...options
    });

    if (!res.ok) {
        const data = await res.json();
        console.log(res.status);
        throw new Error(JSON.stringify(data));
    }
    return res;
}

export async function registerCommands(appId, token, commands) {
    const endpoint = `applications/${appId}/commands`;

    try {
        await discordRequest(endpoint, token, { method: 'PUT', body: commands });
    } catch (err) {
        console.error(err);
    }
}

export function ephemeralMessageResponse(content) {
    return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
            flags: InteractionResponseFlags.EPHEMERAL,
            content: content
        }
    }
}

export async function editOriginalMessage(appId, interactionToken, body, maxRetries = 6) {
    const url = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`;

    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (response.ok) return;

            const status = response.status;
            let data = null;
            try { data = await response.json(); } catch (e) { }

            if (status === 404) {
                await new Promise(r => setTimeout(r, 500 * (i + 1)));
                continue;
            }

            if (status === 429) {
                const waitMs = (data?.retry_after ? Math.ceil(data.retry_after * 1000) : 1000 * (i + 1));
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }

            console.error('Failed to edit message', status, data);
            return;
        } catch (err) {
            console.error('Error editing message, retrying...', err);
            await new Promise(r => setTimeout(r, 500 * (i + 1)));
        }
    }

    console.error('Giving up editing original message after retries');
}
