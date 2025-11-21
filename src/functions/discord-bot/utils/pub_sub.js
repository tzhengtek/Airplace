export async function publishEvent(pubSubClient, topicName, data) {
    try {
        console.log('Publishing event to topic:', topicName, 'with data:', data);
        return pubSubClient.topic(topicName).publishMessage({ data: Buffer.from(data) });
    } catch (error) {
        console.error('Error publishing message:', error);
        throw error;
    }
}
