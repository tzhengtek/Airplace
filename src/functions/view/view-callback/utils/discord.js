export async function editOriginalMessage(appId, interactionToken, body, maxRetries = 6) {
    const url = `https://discord.com/api/v10/webhooks/${appId}/${interactionToken}/messages/@original`;

    for (let i = 0; i < maxRetries; i++) {
        try {
            let options;
            if (body.files && Array.isArray(body.files) && body.files.length > 0) {

                const boundary = '----DiscordBoundary' + Date.now();
                const parts = [];

                const payloadJson = { ...body };

                delete payloadJson.files;

                parts.push(Buffer.from(`--${boundary}\r\n`));
                parts.push(Buffer.from('Content-Disposition: form-data; name="payload_json"\r\n\r\n'));
                parts.push(Buffer.from(JSON.stringify(payloadJson)));
                parts.push(Buffer.from('\r\n'));

                for (let idx = 0; idx < body.files.length; idx++) {
                    const file = body.files[idx];
                    const fieldName = `files[${idx}]`;
                    parts.push(Buffer.from(`--${boundary}\r\n`));
                    parts.push(Buffer.from(`Content-Disposition: form-data; name="${fieldName}"; filename="${file.name}"\r\n`));
                    parts.push(Buffer.from(`Content-Type: ${file.contentType || 'application/octet-stream'}\r\n\r\n`));
                    parts.push(Buffer.from(file.buffer));
                    parts.push(Buffer.from('\r\n'));
                }

                parts.push(Buffer.from(`--${boundary}--\r\n`));
                const payload = Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(String(p))));

                options = {
                    method: 'PATCH',
                    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(payload.length) },
                    body: payload
                };
            } else {
                options = {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                };
            }

            const response = await fetch(url, options);

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
