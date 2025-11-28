// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const secretClient = new SecretManagerServiceClient();

export async function getSecret(secretName: string): Promise<string> {
    try {
        const projectId = process.env.GCP_PROJECT || '390328565727';
        const secretPath = `projects/${projectId}/secrets/${secretName}/versions/latest`;

        console.log(`Accessing secret: ${secretPath}`);

        const [version] = await secretClient.accessSecretVersion({
            name: secretPath,
        });

        if (!version.payload?.data) {
            throw new Error(`Secret ${secretName} has no data`);
        }

        const secret = version.payload.data.toString('utf8');
        if (!secret) {
            throw new Error(`Secret ${secretName} is empty`);
        }

        console.log(`Successfully retrieved secret: ${secretName} from Secret Manager`);
        return secret;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error fetching secret: ${secretName}`, errorMessage);
        throw error;
    }
}

const secretsKey = [
    "firebase-api-key",
    "auth-domain",
    "storage-bucket",
    "messaging-sender-id",
    "app-id",
    "measurement-id",
]

const [firebaseApiKey, authDomain, storageBucket, messagingSenderId, appId, measurementId] = await Promise.all(secretsKey.map(secret => getSecret(secret)));

const firebaseConfig = {
  apiKey: "AIzaSyAIGJZ47DSxkHwuKgk_kr6jvrFntbe0YJk",
  authDomain: "serverless-epitech-prd.firebaseapp.com",
  projectId: "serverless-epitech-prd",
  storageBucket: "serverless-epitech-prd.firebasestorage.app",
  messagingSenderId: "10696410086",
  appId: "1:10696410086:web:58b64c8fcdfa8884178c27",
  measurementId: "G-LXWR91J0GL"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || '');
