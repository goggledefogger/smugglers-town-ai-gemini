import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK
// It automatically uses service account credentials or application default credentials
// when deployed to the Firebase/GCP environment.
admin.initializeApp();

// Example HTTP function (can be removed later)
export const helloWorld = functions.https.onRequest((request, response) => {
  functions.logger.info("Hello logs!", {structuredData: true});
  response.send("Hello from Firebase!");
});

// TODO: Add functions for lobby API (/lobbies POST, PATCH, etc.)
// TODO: Add function for user API (/users/me GET)
