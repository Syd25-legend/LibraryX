const firebaseConfig = {
    apiKey: "AIzaSyDZfid5jftkEG_sY0Oy_XBLGUnTa010f4M",
    authDomain: "lib-x-19ad6.firebaseapp.com",
    projectId: "lib-x-19ad6",
    storageBucket: "lib-x-19ad6.firebasestorage.app",
    messagingSenderId: "227145384272",
    appId: "1:227145384272:web:39ecc68e34b850f0152c55",
    measurementId: "G-0PJDZJ41CN"
};


firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();