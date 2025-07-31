document.addEventListener('DOMContentLoaded', () => {
    const adminPage = document.getElementById('admin-page');
    const logoutBtn = document.getElementById('logout-btn');


    auth.onAuthStateChanged(user => {
        if (user) {
            db.collection('users').doc(user.uid).get().then(doc => {
                if (doc.exists && doc.data().role === 'admin') {
                    adminPage.classList.remove('hidden');
                    initializeAdminDashboard();
                } else {
                    const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
                    window.location.href = baseUrl + 'index.html';
                }
            });
        } else {
            const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            window.location.href = baseUrl + 'index.html';
        }
    });

    function initializeAdminDashboard() {
        setupTabs();
        setupModals();
        setupListeners();
        seedBooks();
    }

    function setupListeners() {
        db.collection('books').orderBy('addedAt', 'desc').onSnapshot(snapshot => loadBooks(snapshot.docs));
        db.collection('users').orderBy('createdAt', 'desc').onSnapshot(snapshot => loadUsers(snapshot.docs));
        db.collection('borrowing').orderBy('requestDate', 'desc').onSnapshot(snapshot => {
            loadRequests(snapshot.docs);
            loadStats();
        });
        db.collection('activity_log').orderBy('timestamp', 'desc').limit(10).onSnapshot(snapshot => {
            const docs = snapshot.docs;
            loadRecentActivity(docs);
            loadAdminNotifications(docs);
            checkForNewNotifications(docs);
        });
    }

    function showToast(message) {
        const toast = document.getElementById('toast-notification');
        const toastMessage = document.getElementById('toast-message');

        toastMessage.textContent = message;
        toast.classList.remove('toast-hidden');
        toast.classList.add('toast-visible');

        setTimeout(() => {
            toast.classList.remove('toast-visible');
            toast.classList.add('toast-hidden');
        }, 4500);
    }

    function showConfirmModal(message, onConfirm) {
        const confirmModal = document.getElementById('confirm-modal');
        const confirmMessage = document.getElementById('confirm-message');
        const confirmOkBtn = document.getElementById('confirm-ok-btn');
        const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

        confirmMessage.textContent = message;
        confirmModal.classList.remove('hidden');

        const okListener = () => {
            onConfirm();
            confirmModal.classList.add('hidden');
            confirmOkBtn.removeEventListener('click', okListener);
            confirmCancelBtn.removeEventListener('click', cancelListener);
        };

        const cancelListener = () => {
            confirmModal.classList.add('hidden');
            confirmOkBtn.removeEventListener('click', okListener);
            confirmCancelBtn.removeEventListener('click', cancelListener);
        };

        confirmOkBtn.addEventListener('click', okListener);
        confirmCancelBtn.addEventListener('click', cancelListener);
    }

    function checkForNewNotifications(logDocs) {
        const lastChecked = sessionStorage.getItem('admin_last_checked_notification') || 0;
        const newNotifications = logDocs.filter(doc => doc.data().timestamp.toMillis() > lastChecked);

        if (newNotifications.length > 0) {
            const latest = newNotifications[0].data();
            if (latest.type === 'book_request') {
                showToast('New Request Received');
            } else {
                showToast('New Notification');
            }
            sessionStorage.setItem('admin_last_checked_notification', latest.timestamp.toMillis());
        }
    }

    function setupTabs() {
        const tabs = document.querySelectorAll('#admin-tabs button');
        const tabContents = {
            overview: document.getElementById('overview-tab-content'),
            books: document.getElementById('books-tab-content'),
            users: document.getElementById('users-tab-content'),
            requests: document.getElementById('requests-tab-content'),
        };

        const lastTab = sessionStorage.getItem('admin_last_tab') || 'overview';

        tabs.forEach(tab => {
            if (tab.dataset.tab === lastTab) {
                tab.classList.replace('tab-inactive', 'tab-active');
                tabContents[lastTab].classList.remove('hidden');
            } else {
                tab.classList.replace('tab-active', 'tab-inactive');
                tabContents[tab.dataset.tab].classList.add('hidden');
            }

            tab.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                sessionStorage.setItem('admin_last_tab', tabName);
                tabs.forEach(t => t.classList.replace('tab-active', 'tab-inactive'));
                e.target.classList.replace('tab-inactive', 'tab-active');
                Object.values(tabContents).forEach(content => content.classList.add('hidden'));
                tabContents[tabName].classList.remove('hidden');
            });
        });
    }

    function setupModals() {

        const bookModal = document.getElementById('book-modal');
        const addBookBtn = document.getElementById('add-book-btn');
        const closeBookModalBtn = document.getElementById('close-book-modal-btn');
        const bookForm = document.getElementById('book-form');
        addBookBtn.addEventListener('click', openAddBookModal);
        closeBookModalBtn.addEventListener('click', () => bookModal.classList.add('hidden'));
        bookForm.addEventListener('submit', handleSaveBook);


        const sendNoticeModal = document.getElementById('send-notice-modal');
        const sendNoticeBtn = document.getElementById('send-notice-btn');
        const closeNoticeModalBtn = document.getElementById('close-notice-modal-btn');
        const sendNoticeForm = document.getElementById('send-notice-form');
        sendNoticeBtn.addEventListener('click', openSendNoticeModal);
        closeNoticeModalBtn.addEventListener('click', () => sendNoticeModal.classList.add('hidden'));
        sendNoticeForm.addEventListener('submit', handleSendNotice);


        const notificationBtn = document.getElementById('admin-notification-btn');
        const notificationPanel = document.getElementById('admin-notification-panel');

        notificationBtn.addEventListener('click', (event) => {

            event.stopPropagation();


            notificationPanel.classList.toggle('hidden');


            if (!notificationPanel.classList.contains('hidden')) {
                sessionStorage.setItem('admin_last_viewed_notification', new Date().getTime());
            }
        });


        window.addEventListener('click', () => {

            if (!notificationPanel.classList.contains('hidden')) {
                notificationPanel.classList.add('hidden');
            }
        });



        window.addEventListener('click', () => {

            if (!notificationPanel.classList.contains('hidden')) {
                notificationPanel.classList.add('hidden');
            }
        });

        // In setupModals function, add event listener for the new button
        document.getElementById('calculate-fine-btn').addEventListener('click', calculateFines);


        async function calculateFines() {
            showToast("Calculating fines...");
            const now = firebase.firestore.Timestamp.now().toDate();
            let finedUsersCount = 0;

            try {
                const borrowingSnapshot = await db.collection('borrowing')
                    .where('status', '==', 'approved')
                    .get();

                const batch = db.batch();
                const notificationsBatch = db.batch(); // Separate batch for notifications

                for (const doc of borrowingSnapshot.docs) {
                    const loan = doc.data();
                    const dueDate = loan.dueDate.toDate();

                    if (now > dueDate) {
                        const overdueDays = Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24));
                        const borrowDate = loan.requestDate.toDate();
                        const allowedReturnDate = new Date(borrowDate);
                        allowedReturnDate.setDate(borrowedDate.getDate() + 15); // 15 days from borrow date

                        if (overdueDays > 5 && now > allowedReturnDate) { // Fine only if more than 5 days overdue from the *original 15-day return period*
                            const fineAmount = overdueDays; // 1 unit per overdue day

                            // Check if a fine notification for this loan/user already exists to prevent duplicates
                            const existingFineNotification = await db.collection('users').doc(loan.userId).collection('notifications')
                                .where('type', '==', 'fine_notice')
                                .where('loanId', '==', doc.id)
                                .limit(1)
                                .get();

                            if (existingFineNotification.empty) {
                                // Send notification to user
                                const userNotifsRef = db.collection('users').doc(loan.userId).collection('notifications').doc();
                                notificationsBatch.set(userNotifsRef, {
                                    message: `You have an overdue fine of ${fineAmount} for '${loan.bookTitle}'. Please return the book.`,
                                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                                    read: false,
                                    type: 'fine_notice',
                                    loanId: doc.id, // Link to the loan document
                                    amount: fineAmount,
                                    bookTitle: loan.bookTitle
                                });
                                finedUsersCount++;
                            }
                        }
                    }
                }

                if (finedUsersCount > 0) {
                    await notificationsBatch.commit(); // Commit notifications first
                    showToast(`Fines calculated and ${finedUsersCount} user(s) notified.`);
                    // You might want to log this in activity_log too
                    db.collection('activity_log').add({
                        message: `Fines calculated. ${finedUsersCount} user(s) received fine notices.`,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        type: 'fine_calculation'
                    });
                } else {
                    showToast("No overdue users found for fines.");
                }

            } catch (error) {
                console.error("Error calculating fines: ", error);
                showToast("Failed to calculate fines.");
            }
        }

        document.getElementById('generate-report-btn').addEventListener('click', generateCSVReport);
        logoutBtn.addEventListener('click', () => {
            sessionStorage.clear();
            auth.signOut().then(() => {
                const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
                window.location.href = baseUrl + 'index.html';
            });
        });
    }

    function openAddBookModal() {
        document.getElementById('book-form').reset();
        document.getElementById('book-id').value = '';
        document.getElementById('book-modal-title').textContent = 'Add a New Book';
        document.getElementById('book-modal').classList.remove('hidden');
    }

    function openEditBookModal(bookId) {
        db.collection('books').doc(bookId).get().then(doc => {
            if (doc.exists) {
                const book = doc.data();
                document.getElementById('book-form').reset();
                document.getElementById('book-modal-title').textContent = 'Edit Book';
                document.getElementById('book-id').value = doc.id;
                document.getElementById('book-title').value = book.title;
                document.getElementById('book-author').value = book.author;
                document.getElementById('book-category').value = book.category;
                document.getElementById('book-isbn').value = book.isbn;
                document.getElementById('book-cover-url').value = book.coverImageUrl;
                document.getElementById('book-modal').classList.remove('hidden');
            }
        });
    }

    async function handleSaveBook(e) {
        e.preventDefault();
        const bookId = document.getElementById('book-id').value;
        const bookData = {
            title: document.getElementById('book-title').value,
            author: document.getElementById('book-author').value,
            category: document.getElementById('book-category').value,
            isbn: document.getElementById('book-isbn').value,
            coverImageUrl: document.getElementById('book-cover-url').value,
        };

        if (bookId) {
            await db.collection('books').doc(bookId).update(bookData);
            showToast("Book updated successfully!");
        } else {
            bookData.status = 'available';
            bookData.addedAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('books').add(bookData);
            await db.collection('activity_log').add({ message: `New book added: '${bookData.title}'`, timestamp: firebase.firestore.FieldValue.serverTimestamp(), type: 'book_add' });
            showToast("Book added successfully!");
        }

        document.getElementById('book-modal').classList.add('hidden');
    }

    function openSendNoticeModal() {
        db.collection('users').where('role', '==', 'student').get().then(snapshot => {
            const targetSelect = document.getElementById('notice-target');
            targetSelect.innerHTML = '<option value="all_users">All Users</option>';
            snapshot.forEach(doc => {
                const user = doc.data();
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = user.email;
                targetSelect.appendChild(option);
            });
            document.getElementById('send-notice-modal').classList.remove('hidden');
        });
    }

    function handleSendNotice(e) {
        e.preventDefault();
        const message = document.getElementById('notice-message').value;
        const target = document.getElementById('notice-target').value;

        const notice = {
            message: message,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            read: false
        };

        if (target === 'all_users') {
            db.collection('users').where('role', '==', 'student').get().then(snapshot => {
                const batch = db.batch();
                snapshot.forEach(doc => {
                    const userNotifsRef = db.collection('users').doc(doc.id).collection('notifications').doc();
                    batch.set(userNotifsRef, notice);
                });
                batch.commit();
            });
        } else {
            db.collection('users').doc(target).collection('notifications').add(notice);
        }

        document.getElementById('send-notice-form').reset();
        document.getElementById('send-notice-modal').classList.add('hidden');
        showToast('Notice sent successfully!');
    }

    function loadStats() {
        db.collection('books').get().then(snap => {
            document.getElementById('total-books-stat').textContent = snap.size;
        });
        db.collection('users').get().then(snap => {
            document.getElementById('active-users-stat').textContent = snap.size;
        });
        db.collection('borrowing').where('status', '==', 'approved').get().then(snap => {
            document.getElementById('current-loans-stat').textContent = snap.size;
        });
    }

    function loadRecentActivity(docs) {
        const list = document.getElementById('recent-activity-list');
        if (docs.length === 0) {
            list.innerHTML = `<p class="text-gray-500">No recent activity.</p>`;
            return;
        }
        list.innerHTML = '';
        docs.forEach(doc => {
            const activity = doc.data();
            const el = document.createElement('div');
            el.className = 'flex items-start';
            el.innerHTML = `<div class="bg-gray-100 p-2 rounded-full mr-3 mt-1"><i class="ph ph-chart-line-up text-gray-600"></i></div><div><p class="font-medium">${activity.message}</p><p class="text-xs text-gray-400">${activity.timestamp.toDate().toLocaleString()}</p></div>`;
            list.appendChild(el);
        });
    }

    function loadBooks(docs) {
        const tbody = document.getElementById('books-table-body');
        if (docs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">No books found.</td></tr>`;
            return;
        }
        tbody.innerHTML = '';
        docs.forEach(doc => {
            const book = doc.data();
            const row = document.createElement('tr');
            row.innerHTML = `<td class="py-3 px-4">${book.title}</td><td class="py-3 px-4">${book.author}</td><td class="py-3 px-4">${book.isbn}</td><td class="py-3 px-4"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${book.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">${book.status}</span></td><td class="py-3 px-4 space-x-2"><button class="edit-book-btn text-blue-600 hover:text-blue-900" data-id="${doc.id}">Edit</button><button class="delete-book-btn text-red-600 hover:text-red-900" data-id="${doc.id}">Delete</button></td>`;
            tbody.appendChild(row);
        });
    }

    function loadUsers(docs) {
        const tbody = document.getElementById('users-table-body');
        if (docs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">No users found.</td></tr>`;
            return;
        }
        tbody.innerHTML = '';
        docs.forEach(doc => {
            const user = doc.data();
            const row = document.createElement('tr');
            row.innerHTML = `<td class="py-3 px-4 font-mono text-sm">${user.uniqueId}</td><td class="py-3 px-4">${user.email}</td><td class="py-3 px-4">${user.role}</td><td class="py-3 px-4">${user.createdAt.toDate().toLocaleDateString()}</td><td class="py-3 px-4"><button class="remove-user-btn text-red-600 hover:text-red-900" data-id="${doc.id}">Remove</button></td>`;
            tbody.appendChild(row);
        });
    }

    function loadRequests(docs) {
        const tbody = document.getElementById('requests-table-body');
        const requests = docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(r => r.status === 'requested');

        if (requests.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">No pending requests.</td></tr>`;
            return;
        }
        tbody.innerHTML = '';
        requests.forEach(request => {
            const row = document.createElement('tr');
            row.innerHTML = `<td class="py-3 px-4">${request.bookTitle}</td><td class="py-3 px-4">${request.userEmail}</td><td class="py-3 px-4">${request.requestDate.toDate().toLocaleDateString()}</td><td class="py-3 px-4 space-x-2"><button class="approve-btn bg-green-500 text-white px-2 py-1 rounded text-xs" data-id="${request.id}" data-book-id="${request.bookId}">Approve</button><button class="decline-btn bg-red-500 text-white px-2 py-1 rounded text-xs" data-id="${request.id}">Decline</button></td>`;
            tbody.appendChild(row);
        });
    }

    function loadAdminNotifications(docs) {
        const list = document.getElementById('admin-notification-list');
        const dot = document.getElementById('admin-notification-dot');
        const log = docs.map(d => d.data()).filter(l => ['new_user', 'book_request', 'book_return'].includes(l.type));

        const lastViewed = sessionStorage.getItem('admin_last_viewed_notification') || 0;
        const hasUnread = log.some(item => item.timestamp.toMillis() > lastViewed);

        if (hasUnread) dot.classList.remove('hidden');
        else dot.classList.add('hidden');

        if (log.length === 0) {
            list.innerHTML = `<p class="text-gray-500 text-center p-4">No notifications.</p>`;
            return;
        }

        list.innerHTML = '';
        log.forEach(item => {
            const el = document.createElement('div');
            el.className = 'p-3 border-b hover:bg-gray-50';
            el.innerHTML = `<p class="text-sm">${item.message}</p><p class="text-xs text-gray-400">${item.timestamp.toDate().toLocaleString()}</p>`;
            list.appendChild(el);
        });
    }

    async function generateCSVReport() {
        showToast("Generating report...");

        try {
            const booksPromise = db.collection('books').get();
            const usersPromise = db.collection('users').get();
            const borrowingPromise = db.collection('borrowing').get();

            const [booksSnapshot, usersSnapshot, borrowingSnapshot] = await Promise.all([booksPromise, usersPromise, borrowingPromise]);

            const booksData = booksSnapshot.docs.map(doc => doc.data());
            const usersData = usersSnapshot.docs.map(doc => doc.data());
            const borrowingData = borrowingSnapshot.docs.map(doc => doc.data());

            let csvContent = "";

            csvContent += "Summary\n";
            csvContent += `Total Books,${booksData.length}\n`;
            csvContent += `Total Users,${usersData.length}\n`;
            csvContent += `Books on Loan,${borrowingData.filter(b => b.status === 'approved').length}\n\n`;

            csvContent += "Borrowing History\n";
            csvContent += "User Email,Book Title,Status,Request Date,Due Date,Return Date\n";
            borrowingData.forEach(loan => {
                const row = [
                    loan.userEmail,
                    `"${loan.bookTitle.replace(/"/g, '""')}"`,
                    loan.status,
                    loan.requestDate ? loan.requestDate.toDate().toLocaleDateString() : 'N/A',
                    loan.dueDate ? loan.dueDate.toDate().toLocaleDateString() : 'N/A',
                    loan.returnDate ? loan.returnDate.toDate().toLocaleDateString() : 'N/A',
                ].join(',');
                csvContent += row + "\r\n";
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", "library_report.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error) {
            console.error("Error generating report: ", error);
            showToast("Failed to generate report.");
        }
    }

    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('approve-btn')) {
            const requestId = e.target.dataset.id;
            const bookId = e.target.dataset.bookId;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 14);

            const batch = db.batch();
            const requestRef = db.collection('borrowing').doc(requestId);
            batch.update(requestRef, { status: 'approved', dueDate: firebase.firestore.Timestamp.fromDate(dueDate) });
            const bookRef = db.collection('books').doc(bookId);
            batch.update(bookRef, { status: 'borrowed' });
            batch.commit();

        } else if (e.target.classList.contains('decline-btn')) {
            db.collection('borrowing').doc(e.target.dataset.id).update({ status: 'declined' });
        } else if (e.target.classList.contains('edit-book-btn')) {
            openEditBookModal(e.target.dataset.id);
        } else if (e.target.classList.contains('delete-book-btn')) {
            showConfirmModal('This will permanently delete the book.', () => {
                db.collection('books').doc(e.target.dataset.id).delete();
            });
        } else if (e.target.classList.contains('remove-user-btn')) {
            showConfirmModal('This will permanently remove the user.', () => {
                db.collection('users').doc(e.target.dataset.id).delete()
                    .catch(err => showToast("Error: " + err.message));
            });
        }
    });


    function seedBooks() {
        db.collection('books').get().then(snapshot => {
            if (snapshot.empty) {
                console.log("No books found, seeding database...");
                const sampleBooks = [
                    { title: "To Kill a Mockingbird", author: "Harper Lee", category: "Classic", isbn: "978-0061120084", coverImageUrl: "https://m.media-amazon.com/images/I/81a4kCNuH+L._AC_UF1000,1000_QL80_.jpg" },
                    { title: "1984", author: "George Orwell", category: "Dystopian", isbn: "978-0451524935", coverImageUrl: "https://i.etsystatic.com/31513412/r/il/455f92/4081428546/il_1588xN.4081428546_dl25.jpg" },
                    { title: "The Great Gatsby", author: "F. Scott Fitzgerald", category: "Classic", isbn: "978-0743273565", coverImageUrl: "https://m.media-amazon.com/images/I/81QuEGw8VPL._AC_UF1000,1000_QL80_.jpg" },
                    { title: "Pride and Prejudice", author: "Jane Austen", category: "Romance", isbn: "978-0141439518", coverImageUrl: "https://almabooks.com/wp-content/uploads/2016/10/9781847493699.jpg" },
                    { title: "The Catcher in the Rye", author: "J.D. Salinger", category: "Fiction", isbn: "978-0316769488", coverImageUrl: "https://m.media-amazon.com/images/I/7108sdEUEGL._SY522_.jpg" },
                    { title: "The Hobbit", author: "J.R.R. Tolkien", category: "Fantasy", isbn: "978-0345339683", coverImageUrl: "https://m.media-amazon.com/images/I/91b0C2YNSrL._AC_UF1000,1000_QL80_.jpg" },
                    { title: "Fahrenheit 451", author: "Ray Bradbury", category: "Sci-Fi", isbn: "978-1451673319", coverImageUrl: "https://m.media-amazon.com/images/I/715y6JcmQZL._UF1000,1000_QL80_.jpg" },
                    { title: "Dune", author: "Frank Herbert", category: "Sci-Fi", isbn: "978-0441013593", coverImageUrl: "https://m.media-amazon.com/images/I/81ym3QUd3KL._AC_UF1000,1000_QL80_.jpg" },
                    { title: "The Lord of the Rings", author: "J.R.R. Tolkien", category: "Fantasy", isbn: "978-0618640157", coverImageUrl: "https://m.media-amazon.com/images/I/81nV6x2ey4L._UF1000,1000_QL80_.jpg" },
                    { title: "Brave New World", author: "Aldous Huxley", category: "Dystopian", isbn: "978-0060850524", coverImageUrl: "https://m.media-amazon.com/images/I/81zE42gT3xL._AC_UF1000,1000_QL80_.jpg" },
                    { title: "The Hitchhiker's Guide to the Galaxy", author: "Douglas Adams", category: "Sci-Fi", isbn: "978-0345391803", coverImageUrl: "https://m.media-amazon.com/images/I/81BbVc2uRIL._SY522_.jpg" },
                    { title: "The Chronicles of Narnia", author: "C.S. Lewis", category: "Fantasy", isbn: "978-0066238500", coverImageUrl: "https://m.media-amazon.com/images/I/81IsNyKSOmL.jpg" },
                    { title: "Moby Dick", author: "Herman Melville", category: "Adventure", isbn: "978-1503280786", coverImageUrl: "https://upload.wikimedia.org/wikipedia/en/f/ff/Moby_dick.jpg?20200616022242" },
                    { title: "War and Peace", author: "Leo Tolstoy", category: "Historical", isbn: "978-1420959379", coverImageUrl: "https://m.media-amazon.com/images/I/81W6BFaJJWL._SY522_.jpg" },
                    { title: "The Alchemist", author: "Paulo Coelho", category: "Fantasy", isbn: "978-0062315007", coverImageUrl: "https://m.media-amazon.com/images/I/617lxveUjYL.jpg" },
                    { title: "One Hundred Years of Solitude", author: "Gabriel Garcia Marquez", category: "Magical Realism", isbn: "978-0060883287", coverImageUrl: "https://m.media-amazon.com/images/I/81dy4cfPGuL.jpg" },
                    { title: "The Picture of Dorian Gray", author: "Oscar Wilde", category: "Gothic Fiction", isbn: "978-0141442464", coverImageUrl: "https://d28hgpri8am2if.cloudfront.net/book_images/onix/cvr9781476788128/the-picture-of-dorian-gray-9781476788128_hr.jpg" },
                    { title: "Frankenstein", author: "Mary Shelley", category: "Gothic Fiction", isbn: "978-0486282114", coverImageUrl: "https://m.media-amazon.com/images/I/91KEmBm2GVL.jpg" },
                    { title: "The Road", author: "Cormac McCarthy", category: "Post-Apocalyptic", isbn: "978-0307387899", coverImageUrl: "https://m.media-amazon.com/images/I/51M7XGLQTBL.jpg" },
                    { title: "Slaughterhouse-Five", author: "Kurt Vonnegut", category: "Satire", isbn: "978-0385333849", coverImageUrl: "https://m.media-amazon.com/images/I/91Jn9wb6ffL._UF1000,1000_QL80_.jpg" },
                    { title: "The Martian", author: "Andy Weir", category: "Sci-Fi", isbn: "978-0804139021", coverImageUrl: "https://m.media-amazon.com/images/I/71Tp86ptAtL._UF894,1000_QL80_.jpg" },
                    { title: "Gone Girl", author: "Gillian Flynn", category: "Thriller", isbn: "978-0307588371", coverImageUrl: "https://m.media-amazon.com/images/I/41l129t7JGL._UF1000,1000_QL80_.jpg" },
                    { title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson", category: "Mystery", isbn: "978-0307949486", coverImageUrl: "https://m.media-amazon.com/images/I/81YW99XIpJL._UF1000,1000_QL80_.jpg" },
                    { title: "Sapiens: A Brief History of Humankind", author: "Yuval Noah Harari", category: "Non-Fiction", isbn: "978-0062316097", coverImageUrl: "https://m.media-amazon.com/images/I/713jIoMO3UL._AC_UF1000,1000_QL80_.jpg" },
                    { title: "Educated: A Memoir", author: "Tara Westover", category: "Memoir", isbn: "978-0399590504", coverImageUrl: "https://m.media-amazon.com/images/I/71-4MkLN5jL.jpg" },
                    { title: "Atomic Habits", author: "James Clear", category: "Self-Help", isbn: "978-0735211292", coverImageUrl: "https://m.media-amazon.com/images/I/81wgcld4wxL._AC_UF1000,1000_QL80_.jpg" },
                    { title: "Where the Crawdads Sing", author: "Delia Owens", category: "Fiction", isbn: "978-0735219090", coverImageUrl: "https://m.media-amazon.com/images/I/81m1s4wIPML._AC_UF1000,1000_QL80_.jpg" },
                    { title: "The Silent Patient", author: "Alex Michaelides", category: "Thriller", isbn: "978-1250301697", coverImageUrl: "https://m.media-amazon.com/images/I/81JJPDNlxSL.jpg" },
                    { title: "Project Hail Mary", author: "Andy Weir", category: "Sci-Fi", isbn: "978-0593135204", coverImageUrl: "https://m.media-amazon.com/images/I/81zD9kaVW9L.jpg" },
                    { title: "Circe", author: "Madeline Miller", category: "Fantasy", isbn: "978-0316556347", coverImageUrl: "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1565909496i/35959740.jpg" }
                ];
                const batch = db.batch();
                sampleBooks.forEach(book => {
                    const docRef = db.collection("books").doc();
                    const bookData = { ...book, status: 'available', addedAt: firebase.firestore.FieldValue.serverTimestamp() };
                    batch.set(docRef, bookData);
                });
                batch.commit().then(() => console.log("Books seeded successfully."));
            }
        });
    }


});