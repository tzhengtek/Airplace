import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import functions from '@google-cloud/functions-framework';



const firestoreapp = initializeApp({
  credential: applicationDefault(),
});

const db = getFirestore(firestoreapp, 'serverless-epitech-firestore');

functions.http('user-create', async (req, res) => {
  try {
    console.log('[user-create] Requête reçue pour addUser');
    const payload = JSON.parse(Buffer.from(req.body.message.data, 'base64').toString('utf-8'));

    if (!payload.userId) {
      console.warn('[user-create] Validation échouée: userId manquant');
      return res.status(400).send("Missing name or email");
    }

    const existingQuery = db.collection('users')
      .where('userId', '==', payload.userId)
      .limit(1);

    const existingSnap = await existingQuery.get();
    if (!existingSnap.empty) {
      console.warn('[user-create] utilisateur existant avec le même id',  payload.userId );
      return res.status(409).send('User with same email already exists');
    }

    await db.collection('users').doc(payload.userId).set({
      createdAt: new Date()
    });

    console.log(`[user-create] user added: ${payload.userId}`);
    res.status(201).send({ message: 'User stored', userId: payload.userId });

  } catch (err) {
    console.error("[user-create] Error addUser:", err);
    res.status(500).send("internal error");
  }
});

