document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const showSignupBtn = document.getElementById('show-signup-btn');
    const showLoginBtn = document.getElementById('show-login-btn');
    const loginFormContainer = document.getElementById('login-form-container');
    const signupFormContainer = document.getElementById('signup-form-container');
    const loginError = document.getElementById('login-error');
    const signupError = document.getElementById('signup-error');
    const roleSelector = document.getElementById('role-selector');
    const loginRoleInput = document.getElementById('login-role');


    roleSelector.addEventListener('click', (e) => {
        const selectedRoleBox = e.target.closest('.role-box');
        if (!selectedRoleBox) return;


        roleSelector.querySelectorAll('.role-box').forEach(box => box.classList.remove('role-selected'));
        selectedRoleBox.classList.add('role-selected');


        loginRoleInput.value = selectedRoleBox.dataset.role;
    });


    showSignupBtn.addEventListener('click', () => {
        loginFormContainer.classList.add('hidden');
        signupFormContainer.classList.remove('hidden');
    });


    showLoginBtn.addEventListener('click', () => {
        signupFormContainer.classList.add('hidden');
        loginFormContainer.classList.remove('hidden');
    });

    function generateUniqueId() {
        return Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase();
    }


    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const role = loginRoleInput.value;

        loginError.classList.add('hidden');

        auth.signInWithEmailAndPassword(email, password)
            .then(userCredential => {
                const user = userCredential.user;

                db.collection('users').doc(user.uid).get().then(doc => {
                    if (doc.exists && doc.data().role === role) {
                        const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
                        if (role === 'admin') {
                            window.location.href = baseUrl + 'admin.html';
                        } else {
                            window.location.href = baseUrl + 'user.html';
                        }
                    } else {
                        auth.signOut();
                        loginError.textContent = 'Role mismatch or user not found.';
                        loginError.classList.remove('hidden');
                    }
                });
            })
            .catch(error => {
                loginError.textContent = error.message;
                loginError.classList.remove('hidden');
            });
    });





    signupForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;

        signupError.classList.add('hidden');

        auth.createUserWithEmailAndPassword(email, password)
            .then(userCredential => {
                const user = userCredential.user;

                db.collection('users').doc(user.uid).set({
                    email: user.email,
                    role: 'student',
                    uniqueId: generateUniqueId(),
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
                    window.location.href = baseUrl + 'user.html?new=true';
                });
            })
            .catch(error => {
                signupError.textContent = error.message;
                signupError.classList.remove('hidden');
            });
    });
});


