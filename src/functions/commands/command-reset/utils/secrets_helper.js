import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const secretClient = new SecretManagerServiceClient();

export async function getSecret(secretName) {
    try {
        const projectId = process.env.GCP_PROJECT || '390328565727';
        const secretPath = `projects/${projectId}/secrets/${secretName}/versions/latest`;

        console.log(`Accessing secret: ${secretPath}`);

        const [version] = await secretClient.accessSecretVersion({
            name: secretPath,
        });

        const secret = version.payload.data.toString('utf8');
        console.log(`Successfully retrieved secret: ${secretName} from Secret Manager`);
        return secret;
    } catch (error) {
        console.error(`Error fetching secret: ${secretName}`, error.message);
        throw error;
    }
}
