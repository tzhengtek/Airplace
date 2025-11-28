import { } from 'firebase-admin/firestore';

export async function getFromFirestore(db, collectionName, documentId) {
    try {
        // Get a reference to the document in the Firestore collection
        const docRef = db.collection(collectionName).doc(documentId);

        // Fetch the document
        const doc = await docRef.get();

        if (!doc.exists) {
            console.log('No such document!');
            return null;
        }
        return doc.data();
    } catch (error) {
        console.error('Error getting document:', error);
        return null;
    }
}
