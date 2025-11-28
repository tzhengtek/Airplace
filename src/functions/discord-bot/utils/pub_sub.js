export async function publishEvent(pubSubClient, topicName, data, attributes = {}) {
    try {
        console.log('Publishing event to topic:', topicName, 'with data:', data);
        return pubSubClient.topic(topicName).publishMessage({ data: Buffer.from(data), attributes });
    } catch (error) {
        console.error('Error publishing message:', error);
        throw error;
    }
}
