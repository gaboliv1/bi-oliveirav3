import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBfukXvQcTRjVWysZsgnOWUFCFGA53VXBg",
  authDomain: "bi-oliveirasv2.firebaseapp.com",
  projectId: "bi-oliveirasv2",
  storageBucket: "bi-oliveirasv2.firebasestorage.app",
  messagingSenderId: "445653102232",
  appId: "1:445653102232:web:3a518c2b1b9b381f84eaed"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
