import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCGaMtTdEzSZ5l50sFn8dxkHwUw8wk40KM",
  authDomain: "gamestore-54ef8.firebaseapp.com",
  projectId: "gamestore-54ef8",
  storageBucket: "gamestore-54ef8.appspot.com",
  messagingSenderId: "723080227045",
  appId: "1:723080227045:web:c0b0565b82f92ddafe8c0c",
  measurementId: "G-HGJD007VCC"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
