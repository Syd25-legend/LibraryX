document.addEventListener('DOMContentLoaded', () => {
    const userPage = document.getElementById('user-page');
    const logoutBtn = document.getElementById('user-logout-btn');
    let currentUser = null;
    let unsubscribeBooks, unsubscribeBorrowing, unsubscribeNotifications;


    let allBooks = [];
    let allBorrowingData = [];
    let userBorrowingData = [];

    auth.onAuthStateChanged(user => {
        if (user) {
            currentUser = user;
            db.collection('users').doc(user.uid).get().then(doc => {
                if (doc.exists && doc.data().role === 'student') {
                    const userData = { uid: user.uid, ...doc.data() };
                    initializeUserDashboard(userData);
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

    function initializeUserDashboard(userData) {
        document.getElementById('user-email-display').textContent = userData.email;

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('new') === 'true') {
            playWelcomeAnimation(userData);
        } else {
            userPage.classList.remove('hidden');
            setupEventListeners(userData);
            setupRealtimeListeners(userData.uid);
        }
    }

    function playWelcomeAnimation(userData) {
        const overlay = document.getElementById('welcome-overlay');
        const mainText = document.getElementById('welcome-text-main');
        const subText = document.getElementById('welcome-text-sub');
        const content = document.querySelector('.welcome-content');

        overlay.classList.add('visible');

        setTimeout(() => {
            mainText.classList.add('shift-up');
            subText.classList.add('fade-in');
        }, 1500);

        setTimeout(() => {
            content.classList.add('fade-out');
            overlay.querySelectorAll('.welcome-icon').forEach(icon => icon.style.animation = 'fadeOutUp 1s ease-in forwards');
        }, 3500);

        setTimeout(() => {
            overlay.style.opacity = '0';
            overlay.style.pointerEvents = 'none';
            userPage.classList.remove('hidden');
            setupEventListeners(userData);
            setupRealtimeListeners(userData.uid);
            history.replaceState(null, '', window.location.pathname);
        }, 4500);

        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 5000);
    }

    function setupRealtimeListeners(userId) {
        if (unsubscribeBooks) unsubscribeBooks();
        unsubscribeBooks = db.collection('books').onSnapshot(snapshot => {
            allBooks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateGenreFilter(allBooks);
            renderBrowsePage();
        });

        if (unsubscribeBorrowing) unsubscribeBorrowing();
        unsubscribeBorrowing = db.collection('borrowing').onSnapshot(snapshot => {
            allBorrowingData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            userBorrowingData = allBorrowingData.filter(req => req.userId === userId);

            renderBrowsePage();
            loadUserStats(userBorrowingData);
            loadMyBooks(userBorrowingData);
        });

        if (unsubscribeNotifications) unsubscribeNotifications();
        unsubscribeNotifications = db.collection('users').doc(userId).collection('notifications')
            .orderBy('timestamp', 'desc')
            .limit(10)
            .onSnapshot(snapshot => {
                loadUserNotifications(snapshot.docs);
            });
    }

    function setupEventListeners(userData) {
        logoutBtn.addEventListener('click', () => {
            auth.signOut().then(() => {
                const baseUrl = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
                window.location.href = baseUrl + 'index.html';
            });
        });

        const mainViewSwitcher = document.getElementById('main-view-switcher');
        const dashboardView = document.getElementById('dashboard-view');
        const browseView = document.getElementById('browse-view');

        mainViewSwitcher.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                mainViewSwitcher.querySelectorAll('button').forEach(b => b.classList.remove('view-active'));
                btn.classList.add('view-active');
                if (btn.dataset.view === 'dashboard') {
                    dashboardView.classList.remove('hidden');
                    browseView.classList.add('hidden');
                } else {
                    browseView.classList.remove('hidden');
                    dashboardView.classList.add('hidden');
                }
            });
        });
        mainViewSwitcher.querySelector('[data-view="dashboard"]').classList.add('view-active');

        document.getElementById('search-input').addEventListener('input', renderBrowsePage);
        document.getElementById('genre-filter').addEventListener('change', renderBrowsePage);

        const userInfoContainer = document.getElementById('user-info-container');
        const userTooltip = document.getElementById('user-tooltip');
        userInfoContainer.addEventListener('mouseenter', () => {
            userTooltip.innerHTML = `
                <p><span class="font-semibold">ID:</span> ${userData.uniqueId}</p>
                <p><span class="font-semibold">Joined:</span> ${userData.createdAt.toDate().toLocaleDateString()}</p>
            `;
            userTooltip.classList.remove('hidden');
        });
        userInfoContainer.addEventListener('mouseleave', () => {
            userTooltip.classList.add('hidden');
        });


        const userNotificationBtn = document.getElementById('user-notification-btn');
        const userNotificationPanel = document.getElementById('user-notification-panel');

        userNotificationBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            userNotificationPanel.classList.toggle('hidden');


            if (!userNotificationPanel.classList.contains('hidden')) {
                db.collection('users').doc(currentUser.uid).collection('notifications')
                    .where('read', '==', false).get().then(snapshot => {
                        const batch = db.batch();
                        snapshot.docs.forEach(doc => {
                            batch.update(doc.ref, { read: true });
                        });
                        batch.commit();
                    });
            }
        });

        window.addEventListener('click', () => {
            if (!userNotificationPanel.classList.contains('hidden')) {
                userNotificationPanel.classList.add('hidden');
            }
        });

        document.body.addEventListener('click', (e) => {
            if (e.target.classList.contains('borrow-btn')) {
                const bookId = e.target.dataset.id;
                const bookTitle = e.target.dataset.title;

                const existingRequest = userBorrowingData.find(req => req.bookId === bookId && (req.status === 'requested' || req.status === 'approved'));

                if (existingRequest) {
                    showToast('Already requested or currently borrowed.');
                } else {
                    db.collection('borrowing').add({
                        bookId: bookId,
                        bookTitle: bookTitle,
                        userId: currentUser.uid,
                        userEmail: currentUser.email,
                        status: 'requested',
                        requestDate: firebase.firestore.FieldValue.serverTimestamp()
                    });

                    db.collection('activity_log').add({
                        message: `${currentUser.email} requested to borrow '${bookTitle}'`,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        type: 'book_request'
                    });

                    showToast('Book requested successfully!');
                }
            }

            if (e.target.classList.contains('return-btn')) {
                const loanId = e.target.dataset.loanId;
                const loanRef = db.collection('borrowing').doc(loanId);

                db.runTransaction(async (transaction) => {
                    const loanDoc = await transaction.get(loanRef);
                    if (!loanDoc.exists) throw "Loan not found!";
                    transaction.update(loanRef, { status: 'returned', returnDate: firebase.firestore.FieldValue.serverTimestamp() });
                });
            }
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

    function loadUserStats(userLoans) {
        const approvedLoans = userLoans.filter(l => l.status === 'approved');
        const now = new Date();
        document.getElementById('currently-borrowed-stat').textContent = approvedLoans.length;
        document.getElementById('books-read-stat').textContent = userLoans.filter(l => l.status === 'returned').length;
        document.getElementById('due-soon-stat').textContent = approvedLoans.filter(b => b.dueDate.toDate() > now && (b.dueDate.toDate() - now) / (1000 * 3600 * 24) <= 3).length;
        document.getElementById('user-overdue-stat').textContent = approvedLoans.filter(b => b.dueDate.toDate() < now).length;
        renderActivityAnalysis(userLoans);
    }

    function renderActivityAnalysis(userLoans) {
        const analysisContainer = document.getElementById('activity-analysis-content');
        if (userLoans.length === 0) {
            analysisContainer.innerHTML = `<p class="opacity-60">Your activity analysis will appear here once you start borrowing and returning books.</p>`;
            return;
        }

        let insights = [];
        const returnedBooks = userLoans.filter(l => l.status === 'returned');
        const borrowedBooks = userLoans.filter(l => l.status === 'approved');
        const now = new Date();
        const thisMonth = now.getMonth();

        const returnedThisMonth = returnedBooks.filter(b => b.returnDate && b.returnDate.toDate().getMonth() === thisMonth).length;
        if (returnedThisMonth > 0) {
            insights.push(`You've been active this month, finishing ${returnedThisMonth} book${returnedThisMonth > 1 ? 's' : ''}. Keep it up!`);
        } else {
            insights.push("It's a great time to pick up a new book and start reading.");
        }

        const overdueCount = borrowedBooks.filter(b => b.dueDate.toDate() < now).length;
        if (overdueCount > 0) {
            insights.push(`<span class="text-red-600 font-semibold">You have ${overdueCount} overdue book${overdueCount > 1 ? 's' : ''}. Please return them soon.</span>`);
        }

        analysisContainer.innerHTML = `<ul class="list-disc list-inside space-y-2">${insights.map(insight => `<li>${insight}</li>`).join('')}</ul>`;
    }

    function loadMyBooks(myLoans) {
        const list = document.getElementById('my-books-list');
        const myApprovedLoans = myLoans.filter(l => l.status === 'approved');

        if (myApprovedLoans.length === 0) {
            list.innerHTML = `<p class="text-gray-500 text-sm text-center mt-4">No books currently borrowed.</p>`;
            return;
        }
        list.innerHTML = '';
        myApprovedLoans.forEach(loan => {
            db.collection('books').doc(loan.bookId).get().then(bookDoc => {
                if (!bookDoc.exists) return;
                const bookDetails = bookDoc.data();
                const bookEl = document.createElement('div');
                bookEl.className = 'bg-white p-3 rounded-lg flex items-center space-x-3';
                bookEl.innerHTML = `<img src="${bookDetails ? bookDetails.coverImageUrl : ''}" alt="${loan.bookTitle}" class="w-10 h-14 object-cover rounded-sm" onerror="this.onerror=null;this.src='https://placehold.co/40x56/e2e8f0/4a5568?text=N/A';"><div class="flex-grow"><p class="font-semibold text-sm">${loan.bookTitle}</p><p class="text-xs text-gray-500">Due ${loan.dueDate.toDate().toLocaleDateString()}</p></div><button class="return-btn bg-red-500 text-white text-xs py-1 px-3 rounded hover:bg-red-600" data-loan-id="${loan.id}">Return</button>`;
                list.appendChild(bookEl);
            });
        });
    }

    function loadUserNotifications(docs) {
        const list = document.getElementById('user-notification-list');
        const dot = document.getElementById('user-notification-dot');

        if (docs.length === 0) {
            list.innerHTML = `<p class="text-gray-500 text-center p-4">No notifications.</p>`;
            dot.classList.add('hidden');
            return;
        }

        const hasUnread = docs.some(doc => doc.data().read === false);
        if (hasUnread) {
            dot.classList.remove('hidden');
        } else {
            dot.classList.add('hidden');
        }

        list.innerHTML = '';
        docs.forEach(doc => {
            const item = doc.data();
            const el = document.createElement('div');
            el.className = 'p-3 border-b hover:bg-gray-50';
            const fontWeight = item.read === false ? 'font-bold' : 'font-normal';
            el.innerHTML = `<p class="text-sm ${fontWeight}">${item.message}</p><p class="text-xs text-gray-400 mt-1">${item.timestamp.toDate().toLocaleString()}</p>`;
            list.appendChild(el);
        });
    }



    function populateGenreFilter(books) {
        const genreFilter = document.getElementById('genre-filter');
        const genres = [...new Set(books.map(book => book.category))];
        genreFilter.innerHTML = '<option value="all">All Genres</option>';
        genres.sort().forEach(genre => {
            const option = document.createElement('option');
            option.value = genre;
            option.textContent = genre;
            genreFilter.appendChild(option);
        });
    }

    function renderBrowsePage() {
        handleSearchAndFilter();
        populateBrowseSections();
    }

    function populateBrowseSections() {
        const browseSectionsContainer = document.getElementById('browse-sections');
        browseSectionsContainer.innerHTML = '';

        const borrowedBookIds = userBorrowingData.filter(loan => loan.status === 'approved').map(loan => loan.bookId);
        const availableBooksForBrowsing = allBooks.filter(book => !borrowedBookIds.includes(book.id));

        let usedIds = new Set();

        const newLaunches = availableBooksForBrowsing.slice(0, 5);
        newLaunches.forEach(b => usedIds.add(b.id));

        const forYou = availableBooksForBrowsing.filter(b => !usedIds.has(b.id)).sort(() => 0.5 - Math.random()).slice(0, 4);

        browseSectionsContainer.appendChild(createBrowseSection('New Launches', newLaunches, 5));
        browseSectionsContainer.appendChild(createBrowseSection('For You', forYou, 4));
        browseSectionsContainer.appendChild(createBrowseSection('All Books', availableBooksForBrowsing, availableBooksForBrowsing.length, false));
    }

    function createBrowseSection(title, books, initialCount, showMore = true) {
        const section = document.createElement('div');
        section.className = 'bg-white p-6 rounded-lg shadow-sm';

        const header = document.createElement('div');
        header.className = 'flex justify-between items-center mb-4';
        header.innerHTML = `<h3 class="text-xl font-bold">${title}</h3>`;

        if (showMore && books.length > initialCount) {
            const moreButton = document.createElement('button');
            moreButton.className = 'text-sm font-semibold text-gray-600 hover:text-gray-900 flex items-center';
            moreButton.innerHTML = 'More <i class="ph ph-caret-down ml-1"></i>';
            header.appendChild(moreButton);

            moreButton.addEventListener('click', () => {
                const content = section.querySelector('.collapsible-content');
                const grid = content.querySelector('.grid');
                const isExpanded = content.classList.contains('expanded');

                document.querySelectorAll('.collapsible-content.expanded').forEach(el => {
                    if (el !== content) {
                        el.classList.remove('expanded');
                        el.previousElementSibling.querySelector('button').innerHTML = 'More <i class="ph ph-caret-down ml-1"></i>';
                        const g = el.querySelector('.grid');
                        while (g.children.length > 5) g.removeChild(g.lastChild);
                    }
                });

                if (isExpanded) {
                    content.classList.remove('expanded');
                    moreButton.innerHTML = 'More <i class="ph ph-caret-down ml-1"></i>';
                    while (grid.children.length > initialCount) grid.removeChild(grid.lastChild);
                } else {
                    content.classList.add('expanded');
                    moreButton.innerHTML = 'Less <i class="ph ph-caret-up ml-1"></i>';
                    books.slice(initialCount).forEach(book => grid.appendChild(createBookCard(book)));
                }
            });
        }

        const content = document.createElement('div');
        content.className = showMore ? 'collapsible-content' : '';

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4';

        books.slice(0, initialCount).forEach(book => grid.appendChild(createBookCard(book)));

        content.appendChild(grid);
        section.appendChild(header);
        section.appendChild(content);

        return section;
    }

    function createBookCard(book) {
        const card = document.createElement('div');
        card.className = 'flex flex-col bg-gray-50 p-4 rounded-lg book-card';
        card.innerHTML = `
            <img src="${book.coverImageUrl}" alt="${book.title}" class="w-full h-48 object-cover rounded-md mb-4" onerror="this.onerror=null;this.src='https://placehold.co/400x600/e2e8f0/4a5568?text=No+Image';">
            <div class="flex-grow">
                <h4 class="font-bold">${book.title}</h4>
                <p class="text-sm text-gray-600">by ${book.author}</p>
            </div>
            <button class="borrow-btn w-full mt-4 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900 cta-button" data-id="${book.id}" data-title="${book.title}">Borrow</button>
        `;
        return card;
    }

    function handleSearchAndFilter() {
        const searchQuery = document.getElementById('search-input').value.toLowerCase();
        const selectedGenre = document.getElementById('genre-filter').value;
        const defaultSections = document.getElementById('browse-sections');
        const searchResultsSection = document.getElementById('search-results-section');
        const loader = document.getElementById('loader');

        if (searchQuery.length > 0 || selectedGenre !== 'all') {
            defaultSections.classList.add('hidden');
            searchResultsSection.classList.add('hidden');
            loader.classList.remove('hidden');

            setTimeout(() => {
                const borrowedBookIds = userBorrowingData.filter(loan => loan.status === 'approved').map(loan => loan.bookId);
                let books = allBooks.filter(book => !borrowedBookIds.includes(book.id));

                if (searchQuery.length > 0) {
                    books = books.filter(book =>
                        book.title.toLowerCase().includes(searchQuery) ||
                        book.author.toLowerCase().includes(searchQuery)
                    );
                }
                if (selectedGenre !== 'all') {
                    books = books.filter(book => book.category === selectedGenre);
                }

                loader.classList.add('hidden');
                searchResultsSection.classList.remove('hidden');
                searchResultsSection.innerHTML = '';

                const searchGrid = createBrowseSection('Your Search', books, books.length, false);
                searchResultsSection.appendChild(searchGrid);
            }, 500);
        } else {
            searchResultsSection.classList.add('hidden');
            defaultSections.classList.add('hidden');
            loader.classList.remove('hidden');
            setTimeout(() => {
                loader.classList.add('hidden');
                defaultSections.classList.remove('hidden');
            }, 500);
        }
    }
});