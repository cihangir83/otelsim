import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDeO-VEk-VryGgX0R_lcmz2eKMLIlbhjBM",
    authDomain: "otelsim-7fe1e.firebaseapp.com",
    projectId: "otelsim-7fe1e",
    storageBucket: "otelsim-7fe1e.firebasestorage.app",
    messagingSenderId: "333358315105",
    appId: "1:333358315105:web:c745d9a640890c177a5c20"
};

// Firebase'i başlat
const app = initializeApp(firebaseConfig);

// Auth ve Firestore servislerini al
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;