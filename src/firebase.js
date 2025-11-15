import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyATw6VYnsTtPQnJXtHJWvx8FxC6__q3ulk",
  authDomain: "quiz-buteur.firebaseapp.com",
  databaseURL: "https://quiz-buteur-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quiz-buteur",
  storageBucket: "quiz-buteur.firebasestorage.app",
  messagingSenderId: "963474612609",
  appId: "1:963474612609:web:ffc84fb130b9f561c74880",
  measurementId: "G-VMTQN2RT3C"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export { app, db, auth };

