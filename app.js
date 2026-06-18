// ==================== CONFIGURATION DE SYNCHRONISATION EN LIGNE ====================
// Choisissez UNE des deux méthodes pour synchroniser vos données en ligne.
// Si les deux sont vides, l'application fonctionnera en local (localStorage).

// --- MÉTHODE A : Google Apps Script (100% GRATUIT, SANS CARTE BANCAIRE) ---
// Renseignez l'URL de votre Web App Google Apps Script ici :
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxzKTdGeoKAMCtMQm_SRiDXneMun58ptq8RozvLlLrK44WElWt9a6T-TM-ZKQYhgtmV/exec";

// --- MÉTHODE B : Firebase Realtime Database (Optionnel) ---
const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    databaseURL: "", // Laissez vide si vous utilisez la méthode A
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
};

let db = null;
let useFirebase = false;
let useGoogleScript = false;

// ==================== DATA STORE ====================
const STORAGE_KEY = 'arena2v2_data';

let state = {
    teams: [],     // { id, name, member1, member2 }
    matches: []    // { id, date, teamAId, teamBId, sets, setsWonA, setsWonB, winner, bestFighter, totalKillsA, totalKillsB }
};

// Current match being built
let currentMatch = {
    teamAId: null,
    teamBId: null,
    sets: [],
    currentSetIndex: 0
};

// ==================== ADMIN STATE ====================
let isAdmin = false;
const ADMIN_PASSWORD = "HuebaldCaca"; // Mot de passe d'administration par défaut (facilement modifiable)

function checkAdminStatus() {
    const urlParams = new URLSearchParams(window.location.search);
    const hasAdminQuery = urlParams.get('admin') === 'true' || urlParams.get('admin') === '1';
    const hasAdminSession = sessionStorage.getItem('arena2v2_admin') === 'true';
    
    if (hasAdminQuery || hasAdminSession) {
        isAdmin = true;
        if (hasAdminQuery) {
            sessionStorage.setItem('arena2v2_admin', 'true');
        }
    } else {
        isAdmin = false;
    }
}

function updateAdminUI() {
    const navMatch = document.getElementById('nav-match');
    const navEquipes = document.getElementById('nav-equipes');
    const appFooter = document.getElementById('app-footer');
    const adminLock = document.getElementById('btn-admin-lock');
    const addTeamForm = document.querySelector('.add-team-form');

    if (isAdmin) {
        if (navMatch) navMatch.classList.remove('hidden');
        if (navEquipes) navEquipes.classList.remove('hidden');
        if (appFooter) appFooter.classList.remove('hidden');
        if (adminLock) {
            adminLock.innerHTML = '🔒 Déconnexion';
            adminLock.classList.add('btn-primary');
            adminLock.classList.remove('btn-ghost');
        }
        if (addTeamForm) addTeamForm.classList.remove('hidden');
    } else {
        if (navMatch) navMatch.classList.add('hidden');
        if (navEquipes) navEquipes.classList.add('hidden');
        if (appFooter) appFooter.classList.add('hidden');
        if (adminLock) {
            adminLock.innerHTML = '🔑 Admin';
            adminLock.classList.remove('btn-primary');
            adminLock.classList.add('btn-ghost');
        }
        if (addTeamForm) addTeamForm.classList.add('hidden');

        // Rediriger vers classement si sur un onglet admin
        const activeTab = document.querySelector('.nav-tab.active');
        if (activeTab && (activeTab.dataset.tab === 'match' || activeTab.dataset.tab === 'equipes')) {
            switchToTab('classement');
        }
    }

    renderTeams();
    renderHistory();
}

function toggleAdminMode() {
    if (isAdmin) {
        confirmDialog("Déconnexion", "Voulez-vous quitter le mode administrateur ?").then(confirmed => {
            if (confirmed) {
                isAdmin = false;
                sessionStorage.removeItem('arena2v2_admin');
                
                // Nettoyer l'URL du paramètre admin
                const url = new URL(window.location);
                url.searchParams.delete('admin');
                window.history.replaceState({}, '', url);

                updateAdminUI();
                showToast("Déconnexion réussie");
            }
        });
    } else {
        const password = prompt("Veuillez entrer le code Administrateur pour modifier les données (défaut: 1234) :");
        if (password === null) return;

        if (password === ADMIN_PASSWORD) {
            isAdmin = true;
            sessionStorage.setItem('arena2v2_admin', 'true');
            updateAdminUI();
            showToast("Accès Admin accordé !");
        } else {
            showToast("Code erroné.", "error");
        }
    }
}

// ==================== PERSISTENCE ====================
function saveState() {
    if (useGoogleScript) {
        // Envoi simple sans header JSON pour éviter le preflight CORS (OPTIONS)
        fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(state)
        })
        .then(() => {
            showToast("Données enregistrées en ligne !");
            // Sauvegarde locale en cache
            saveLocalState();
        })
        .catch(e => {
            console.error("Erreur de sauvegarde Google Script :", e);
            showToast("Erreur de sauvegarde en ligne", "error");
        });
    } else if (useFirebase && db) {
        db.ref('arena2v2_state').set(state).catch(e => {
            console.error("Erreur de sauvegarde Firebase :", e);
            showToast("Erreur de sauvegarde en ligne", "error");
        });
    } else {
        saveLocalState();
    }
}

function saveLocalState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Save failed:', e);
    }
}

function loadLocalState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            state.teams = parsed.teams || [];
            state.matches = parsed.matches || [];
        }
    } catch (e) {
        console.error('Load failed:', e);
    }
}

function initOnlineSync() {
    if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL !== "") {
        useGoogleScript = true;
        console.log("Synchronisation Google Apps Script configurée !");
        loadOnlineSyncData();
    } else if (typeof firebase !== 'undefined' && firebaseConfig.databaseURL && firebaseConfig.databaseURL !== "") {
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.database();
            useFirebase = true;
            console.log("Firebase connecté avec succès !");
            
            // Écouter les données en temps réel
            db.ref('arena2v2_state').on('value', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    state.teams = data.teams || [];
                    state.matches = data.matches || [];
                } else {
                    state.teams = [];
                    state.matches = [];
                }
                renderAll();
            });
        } catch (error) {
            console.error("Erreur d'initialisation Firebase :", error);
            showToast("Erreur de connexion Firebase. Utilisation du stockage local.", "error");
            useFirebase = false;
            loadLocalState();
        }
    } else {
        console.log("Aucune synchronisation en ligne configurée. Utilisation du stockage local (localStorage).");
        loadLocalState();
    }
}

function loadOnlineSyncData(quiet = false) {
    if (useGoogleScript) {
        if (!quiet) showToast("Synchronisation en ligne...", "info");
        
        fetch(GOOGLE_SCRIPT_URL, { redirect: 'follow' })
            .then(res => res.json())
            .then(data => {
                if (data) {
                    state.teams = data.teams || [];
                    state.matches = data.matches || [];
                    saveLocalState(); // Met à jour le cache local
                    renderAll();
                    if (!quiet) showToast("Données actualisées !", "success");
                }
            })
            .catch(err => {
                console.error("Erreur de récupération Google Script :", err);
                if (!quiet) showToast("Erreur de chargement en ligne.", "error");
                loadLocalState();
                renderAll();
            });
    } else if (useFirebase) {
        // Avec Firebase, les données se mettent à jour toutes seules via le listener on('value')
        if (!quiet) showToast("Données en temps réel (Firebase) actives", "success");
    } else {
        if (!quiet) showToast("Mode local activé (pas de base de données en ligne)", "info");
    }
}

// ==================== UTILITIES ====================
function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getTeam(id) {
    return state.teams.find(t => t.id === id);
}

function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function confirmDialog(title, message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay';
        overlay.innerHTML = `
            <div class="dialog-box">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="dialog-actions">
                    <button class="btn btn-ghost dialog-cancel">Annuler</button>
                    <button class="btn btn-danger dialog-confirm">Confirmer</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.dialog-cancel').onclick = () => { overlay.remove(); resolve(false); };
        overlay.querySelector('.dialog-confirm').onclick = () => { overlay.remove(); resolve(true); };
        overlay.addEventListener('click', (e) => { if (e.target === overlay) { overlay.remove(); resolve(false); } });
    });
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function diffClass(val) {
    if (val > 0) return 'val-diff-pos';
    if (val < 0) return 'val-diff-neg';
    return 'val-diff-zero';
}

function diffStr(val) {
    if (val > 0) return `+${val}`;
    return `${val}`;
}

// ==================== NAVIGATION ====================
function initNav() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('hidden')) return;
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const tabId = `tab-${tab.dataset.tab}`;
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function switchToTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.nav-tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// ==================== COMPUTE STATS ====================
function computeStats() {
    // Initialize stats per team
    const stats = {};
    state.teams.forEach(t => {
        stats[t.id] = {
            points: 0,
            matchesPlayed: 0,
            wins: 0,
            losses: 0,
            bonusPoints: 0,
            setsWon: 0,
            setsLost: 0,
            combatsWon: 0,
            combatsLost: 0,
            killsFor: 0,
            killsAgainst: 0
        };
    });

    state.matches.forEach(match => {
        const sA = stats[match.teamAId];
        const sB = stats[match.teamBId];
        if (!sA || !sB) return; // team was deleted

        // Matches played
        sA.matchesPlayed++;
        sB.matchesPlayed++;

        // Wins / Losses / Points
        if (match.winner === 'a') {
            sA.wins++;
            sA.points += 3;
            sB.losses++;
            sB.points += 1;
        } else {
            sB.wins++;
            sB.points += 3;
            sA.losses++;
            sA.points += 1;
        }

        // Best fighter bonus
        if (match.bestFighter) {
            const bonusTeamStats = stats[match.bestFighter.teamId];
            if (bonusTeamStats) {
                bonusTeamStats.bonusPoints++;
                bonusTeamStats.points++;
            }
        }

        // Sets
        sA.setsWon += match.setsWonA;
        sA.setsLost += match.setsWonB;
        sB.setsWon += match.setsWonB;
        sB.setsLost += match.setsWonA;

        // Combats & Kills
        match.sets.forEach(set => {
            set.combats.forEach(combat => {
                if (combat.winner === 'a') {
                    sA.combatsWon++;
                    sB.combatsLost++;
                } else if (combat.winner === 'b') {
                    sB.combatsWon++;
                    sA.combatsLost++;
                }
                sA.killsFor += (combat.killsA || 0);
                sA.killsAgainst += (combat.killsB || 0);
                sB.killsFor += (combat.killsB || 0);
                sB.killsAgainst += (combat.killsA || 0);
            });
        });
    });

    return stats;
}

// ==================== RENDER: RANKING ====================
function renderRanking() {
    const stats = computeStats();
    const tbody = document.getElementById('ranking-body');
    const emptyEl = document.getElementById('ranking-empty');
    const wrapperEl = document.getElementById('ranking-wrapper');
    const legendEl = document.getElementById('legend-box');

    if (state.teams.length === 0) {
        wrapperEl.classList.add('hidden');
        legendEl.classList.add('hidden');
        emptyEl.classList.remove('hidden');
        return;
    }

    wrapperEl.classList.remove('hidden');
    legendEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    // Sort teams
    const sorted = [...state.teams].sort((a, b) => {
        const sa = stats[a.id], sb = stats[b.id];
        // 1. Points
        if (sb.points !== sa.points) return sb.points - sa.points;
        // 2. Goal Average (kills)
        const gaA = sa.killsFor - sa.killsAgainst;
        const gaB = sb.killsFor - sb.killsAgainst;
        if (gaB !== gaA) return gaB - gaA;
        // 3. Set difference
        const sdA = sa.setsWon - sa.setsLost;
        const sdB = sb.setsWon - sb.setsLost;
        if (sdB !== sdA) return sdB - sdA;
        // 4. Combat difference
        const cdA = sa.combatsWon - sa.combatsLost;
        const cdB = sb.combatsWon - sb.combatsLost;
        return cdB - cdA;
    });

    tbody.innerHTML = sorted.map((team, i) => {
        const s = stats[team.id];
        const rank = i + 1;
        const setDiff = s.setsWon - s.setsLost;
        const combatDiff = s.combatsWon - s.combatsLost;
        const ga = s.killsFor - s.killsAgainst;

        let rankClass = 'rank-default';
        if (rank === 1) rankClass = 'rank-1';
        else if (rank === 2) rankClass = 'rank-2';
        else if (rank === 3) rankClass = 'rank-3';

        return `<tr>
            <td><span class="rank-badge ${rankClass}">${rank}</span></td>
            <td class="col-team">
                <div class="team-cell">
                    <span class="team-cell-name">${escHtml(team.name)}</span>
                    <span class="team-cell-members">${escHtml(team.member1)} · ${escHtml(team.member2)}</span>
                </div>
            </td>
            <td><span class="val-pts">${s.points}</span></td>
            <td>${s.matchesPlayed}</td>
            <td><span class="val-win">${s.wins}</span></td>
            <td><span class="val-loss">${s.losses}</span></td>
            <td><span class="val-bonus">${s.bonusPoints}</span></td>
            <td>${s.killsFor}</td>
            <td>${s.killsAgainst}</td>
            <td><span class="val-ga ${diffClass(ga)}">${diffStr(ga)}</span></td>
            <td>${s.setsWon}</td>
            <td>${s.setsLost}</td>
            <td><span class="${diffClass(setDiff)}">${diffStr(setDiff)}</span></td>
            <td>${s.combatsWon}</td>
            <td>${s.combatsLost}</td>
            <td><span class="${diffClass(combatDiff)}">${diffStr(combatDiff)}</span></td>
        </tr>`;
    }).join('');

    // Update header stats
    document.getElementById('stat-teams').textContent = state.teams.length;
    document.getElementById('stat-matches').textContent = state.matches.length;
}

function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==================== RENDER: TEAMS ====================
function renderTeams() {
    const listEl = document.getElementById('teams-list');
    const emptyEl = document.getElementById('teams-empty');

    if (state.teams.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }

    emptyEl.classList.add('hidden');

    listEl.innerHTML = state.teams.map(team => {
        const initials = team.name.slice(0, 2).toUpperCase();
        return `<div class="team-card" data-id="${team.id}">
            <div class="team-card-info">
                <div class="team-card-avatar">${escHtml(initials)}</div>
                <div class="team-card-details">
                    <h3>${escHtml(team.name)}</h3>
                    <p>🎮 ${escHtml(team.member1)} · ${escHtml(team.member2)}</p>
                </div>
            </div>
            ${isAdmin ? `<button class="btn-delete-team" onclick="deleteTeam('${team.id}')" title="Supprimer">✕</button>` : ''}
        </div>`;
    }).join('');
}

// ==================== TEAMS CRUD ====================
function addTeam() {
    const nameInput = document.getElementById('input-team-name');
    const m1Input = document.getElementById('input-member-1');
    const m2Input = document.getElementById('input-member-2');

    const name = nameInput.value.trim();
    const member1 = m1Input.value.trim();
    const member2 = m2Input.value.trim();

    if (!name) { showToast('Entrez un nom d\'équipe', 'error'); nameInput.focus(); return; }
    if (!member1) { showToast('Entrez le nom du combattant 1', 'error'); m1Input.focus(); return; }
    if (!member2) { showToast('Entrez le nom du combattant 2', 'error'); m2Input.focus(); return; }

    if (state.teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
        showToast('Une équipe avec ce nom existe déjà', 'error');
        return;
    }

    state.teams.push({ id: genId(), name, member1, member2 });
    saveState();
    nameInput.value = '';
    m1Input.value = '';
    m2Input.value = '';
    nameInput.focus();

    renderTeams();
    renderRanking();
    populateTeamSelects();
    showToast(`Équipe "${name}" ajoutée !`);
}

async function deleteTeam(id) {
    const team = getTeam(id);
    if (!team) return;

    const hasMatches = state.matches.some(m => m.teamAId === id || m.teamBId === id);
    let msg = `Supprimer l'équipe "${team.name}" ?`;
    if (hasMatches) {
        msg += ` Tous les matchs impliquant cette équipe seront également supprimés.`;
    }

    const confirmed = await confirmDialog('Supprimer l\'équipe', msg);
    if (!confirmed) return;

    if (hasMatches) {
        state.matches = state.matches.filter(m => m.teamAId !== id && m.teamBId !== id);
    }
    state.teams = state.teams.filter(t => t.id !== id);
    saveState();

    renderTeams();
    renderRanking();
    renderHistory();
    populateTeamSelects();
    showToast(`Équipe "${team.name}" supprimée`);
}

// ==================== MATCH: TEAM SELECTS ====================
function populateTeamSelects() {
    const selA = document.getElementById('select-team-a');
    const selB = document.getElementById('select-team-b');

    const optionsHtml = '<option value="">— Choisir —</option>' +
        state.teams.map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('');

    selA.innerHTML = optionsHtml;
    selB.innerHTML = optionsHtml;
}

function onTeamSelectChange() {
    const aId = document.getElementById('select-team-a').value;
    const bId = document.getElementById('select-team-b').value;

    // Show members
    const membersA = document.getElementById('members-a');
    const membersB = document.getElementById('members-b');

    if (aId) {
        const t = getTeam(aId);
        membersA.innerHTML = `<span>${escHtml(t.member1)}</span><span>${escHtml(t.member2)}</span>`;
    } else {
        membersA.innerHTML = '';
    }

    if (bId) {
        const t = getTeam(bId);
        membersB.innerHTML = `<span>${escHtml(t.member1)}</span><span>${escHtml(t.member2)}</span>`;
    } else {
        membersB.innerHTML = '';
    }

    const startBtn = document.getElementById('btn-start-match');
    startBtn.disabled = !(aId && bId && aId !== bId);
}

// ==================== MATCH: FLOW ====================
function startMatch() {
    const aId = document.getElementById('select-team-a').value;
    const bId = document.getElementById('select-team-b').value;

    if (!aId || !bId || aId === bId) return;

    currentMatch = {
        teamAId: aId,
        teamBId: bId,
        sets: [],
        currentSetIndex: 0
    };

    // Show step 2
    document.getElementById('match-step-1').classList.add('hidden');
    document.getElementById('match-step-2').classList.remove('hidden');
    document.getElementById('match-step-3').classList.add('hidden');

    const teamA = getTeam(aId);
    const teamB = getTeam(bId);

    document.getElementById('sb-name-a').textContent = teamA.name;
    document.getElementById('sb-name-b').textContent = teamB.name;
    document.getElementById('sb-score-a').textContent = '0';
    document.getElementById('sb-score-b').textContent = '0';

    // Create first set
    currentMatch.sets = [];
    addNewSet();
}

function addNewSet() {
    const setIndex = currentMatch.sets.length;
    currentMatch.sets.push({
        combats: [
            { killsA: 0, killsB: 0, winner: null },
            { killsA: 0, killsB: 0, winner: null },
            { killsA: 0, killsB: 0, winner: null }
        ],
        winner: null
    });

    renderSets();
}

function renderSets() {
    const area = document.getElementById('sets-area');
    const teamA = getTeam(currentMatch.teamAId);
    const teamB = getTeam(currentMatch.teamBId);

    area.innerHTML = currentMatch.sets.map((set, si) => {
        const isActive = set.winner === null;
        let stateClass = 'set-active';
        let badgeHtml = '<span class="set-result-badge pending">En cours</span>';

        if (set.winner === 'a') {
            stateClass = 'set-won-a';
            badgeHtml = `<span class="set-result-badge won-a">✓ ${escHtml(teamA.name)}</span>`;
        } else if (set.winner === 'b') {
            stateClass = 'set-won-b';
            badgeHtml = `<span class="set-result-badge won-b">✓ ${escHtml(teamB.name)}</span>`;
        }

        const combatsHtml = set.combats.map((combat, ci) => {
            return `<div class="combat-row ${combat.winner ? 'combat-done' : ''}" data-set="${si}" data-combat="${ci}">
                <div class="combat-team-side side-a">
                    <span class="combat-team-name">${escHtml(teamA.name)}</span>
                    <input type="number" class="combat-kills-input" min="0" max="99"
                        value="${combat.killsA}"
                        onchange="onKillsChange(${si}, ${ci}, 'a', this.value)"
                        placeholder="0"
                        title="Kills ${escHtml(teamA.name)}"
                        ${set.winner ? 'disabled' : ''}>
                </div>
                <button class="combat-winner-btn ${combat.winner === 'a' ? 'selected winner-a' : ''}"
                    onclick="setCombatWinner(${si}, ${ci}, 'a')"
                    ${set.winner ? 'disabled' : ''}>✓</button>
                <div style="text-align:center">
                    <div class="combat-label">Combat ${ci + 1}</div>
                    <div class="combat-vs">VS</div>
                </div>
                <button class="combat-winner-btn ${combat.winner === 'b' ? 'selected winner-b' : ''}"
                    onclick="setCombatWinner(${si}, ${ci}, 'b')"
                    ${set.winner ? 'disabled' : ''}>✓</button>
                <div class="combat-team-side side-b">
                    <input type="number" class="combat-kills-input" min="0" max="99"
                        value="${combat.killsB}"
                        onchange="onKillsChange(${si}, ${ci}, 'b', this.value)"
                        placeholder="0"
                        title="Kills ${escHtml(teamB.name)}"
                        ${set.winner ? 'disabled' : ''}>
                    <span class="combat-team-name">${escHtml(teamB.name)}</span>
                </div>
            </div>`;
        }).join('');

        return `<div class="set-block ${stateClass}">
            <div class="set-header">
                <h4>Set ${si + 1}</h4>
                ${badgeHtml}
            </div>
            <div class="set-combats">${combatsHtml}</div>
        </div>`;
    }).join('');
}

function onKillsChange(setIndex, combatIndex, side, value) {
    const val = Math.max(0, parseInt(value) || 0);
    if (side === 'a') {
        currentMatch.sets[setIndex].combats[combatIndex].killsA = val;
    } else {
        currentMatch.sets[setIndex].combats[combatIndex].killsB = val;
    }
}

function setCombatWinner(setIndex, combatIndex, side) {
    const set = currentMatch.sets[setIndex];
    if (set.winner) return; // set already decided

    const combat = set.combats[combatIndex];

    // Toggle
    if (combat.winner === side) {
        combat.winner = null;
    } else {
        combat.winner = side;
    }

    // Check if set has a winner (2 combats won)
    checkSetWinner(setIndex);
    renderSets();
    updateScoreboard();
}

function checkSetWinner(setIndex) {
    const set = currentMatch.sets[setIndex];
    const winsA = set.combats.filter(c => c.winner === 'a').length;
    const winsB = set.combats.filter(c => c.winner === 'b').length;

    // All 3 combats must be played
    const allDone = set.combats.every(c => c.winner !== null);

    if (allDone) {
        if (winsA > winsB) {
            set.winner = 'a';
        } else if (winsB > winsA) {
            set.winner = 'b';
        }
        // In case of a 0-0 edge case (shouldn't happen with 3 combats), no winner
        checkMatchEnd();
    }
}

function updateScoreboard() {
    let setsA = 0, setsB = 0;
    currentMatch.sets.forEach(set => {
        if (set.winner === 'a') setsA++;
        if (set.winner === 'b') setsB++;
    });
    document.getElementById('sb-score-a').textContent = setsA;
    document.getElementById('sb-score-b').textContent = setsB;
}

function checkMatchEnd() {
    let setsA = 0, setsB = 0;
    currentMatch.sets.forEach(set => {
        if (set.winner === 'a') setsA++;
        if (set.winner === 'b') setsB++;
    });

    if (setsA >= 2 || setsB >= 2) {
        // Match is over
        showMatchResult(setsA, setsB);
    } else {
        // Need more sets
        addNewSet();
    }
}

function showMatchResult(setsA, setsB) {
    const winner = setsA >= 2 ? 'a' : 'b';
    const teamA = getTeam(currentMatch.teamAId);
    const teamB = getTeam(currentMatch.teamBId);
    const winnerTeam = winner === 'a' ? teamA : teamB;

    // Compute totals
    let totalKillsA = 0, totalKillsB = 0, totalCombatsA = 0, totalCombatsB = 0;
    currentMatch.sets.forEach(set => {
        set.combats.forEach(c => {
            totalKillsA += c.killsA || 0;
            totalKillsB += c.killsB || 0;
            if (c.winner === 'a') totalCombatsA++;
            if (c.winner === 'b') totalCombatsB++;
        });
    });

    // Show step 3
    document.getElementById('match-step-2').classList.add('hidden');
    document.getElementById('match-step-3').classList.remove('hidden');

    const banner = document.getElementById('result-banner');
    banner.textContent = `🏆 ${winnerTeam.name} remporte le match !`;
    banner.className = `result-winner-banner winner-${winner}`;

    document.getElementById('result-score').textContent = `${setsA} - ${setsB}`;

    document.getElementById('result-details').innerHTML = `
        <strong>${escHtml(teamA.name)}</strong> : ${totalCombatsA} combats gagnés · ${totalKillsA} kills<br>
        <strong>${escHtml(teamB.name)}</strong> : ${totalCombatsB} combats gagnés · ${totalKillsB} kills
    `;

    // Fighter options
    const fighters = [
        { name: teamA.member1, teamId: teamA.id, side: 'a', teamName: teamA.name },
        { name: teamA.member2, teamId: teamA.id, side: 'a', teamName: teamA.name },
        { name: teamB.member1, teamId: teamB.id, side: 'b', teamName: teamB.name },
        { name: teamB.member2, teamId: teamB.id, side: 'b', teamName: teamB.name }
    ];

    const optionsEl = document.getElementById('fighter-options');
    optionsEl.innerHTML = fighters.map((f, i) => `
        <div class="fighter-option" data-index="${i}" onclick="selectBestFighter(${i})">
            <span class="fighter-team-dot dot-${f.side}"></span>
            <span class="fighter-name">${escHtml(f.name)}</span>
            <span class="fighter-team-label">${escHtml(f.teamName)}</span>
        </div>
    `).join('');

    // Store fighters for later
    currentMatch._fighters = fighters;
    currentMatch._winner = winner;
    currentMatch._setsA = setsA;
    currentMatch._setsB = setsB;
    currentMatch._selectedFighter = null;

    document.getElementById('btn-save-match').disabled = true;
}

function selectBestFighter(index) {
    currentMatch._selectedFighter = index;

    document.querySelectorAll('.fighter-option').forEach((el, i) => {
        el.classList.toggle('selected', i === index);
    });

    document.getElementById('btn-save-match').disabled = false;
}

function saveMatch() {
    if (currentMatch._selectedFighter === null) {
        showToast('Sélectionnez le meilleur combattant', 'error');
        return;
    }

    const fighter = currentMatch._fighters[currentMatch._selectedFighter];

    // Compute total kills
    let totalKillsA = 0, totalKillsB = 0;
    currentMatch.sets.forEach(set => {
        set.combats.forEach(c => {
            totalKillsA += c.killsA || 0;
            totalKillsB += c.killsB || 0;
        });
    });

    const match = {
        id: genId(),
        date: new Date().toISOString(),
        teamAId: currentMatch.teamAId,
        teamBId: currentMatch.teamBId,
        sets: currentMatch.sets.map(set => ({
            combats: set.combats.map(c => ({
                killsA: c.killsA || 0,
                killsB: c.killsB || 0,
                winner: c.winner
            })),
            winner: set.winner
        })),
        setsWonA: currentMatch._setsA,
        setsWonB: currentMatch._setsB,
        winner: currentMatch._winner,
        bestFighter: {
            name: fighter.name,
            teamId: fighter.teamId
        },
        totalKillsA,
        totalKillsB
    };

    state.matches.push(match);
    saveState();

    showToast('Match enregistré avec succès !');
    resetMatchForm();
    renderRanking();
    renderHistory();
    switchToTab('classement');
}

function resetMatchForm() {
    currentMatch = { teamAId: null, teamBId: null, sets: [], currentSetIndex: 0 };

    document.getElementById('match-step-1').classList.remove('hidden');
    document.getElementById('match-step-2').classList.add('hidden');
    document.getElementById('match-step-3').classList.add('hidden');

    document.getElementById('select-team-a').value = '';
    document.getElementById('select-team-b').value = '';
    document.getElementById('members-a').innerHTML = '';
    document.getElementById('members-b').innerHTML = '';
    document.getElementById('btn-start-match').disabled = true;
    document.getElementById('sets-area').innerHTML = '';
}

function cancelMatch() {
    resetMatchForm();
}

function backToSets() {
    // Go back to step 2 and let user modify
    // Remove the last set if match was decided (undo the auto-added set logic)
    document.getElementById('match-step-3').classList.add('hidden');
    document.getElementById('match-step-2').classList.remove('hidden');

    // Reset all set winners so user can re-enter
    // Actually, just show what we have and let them continue
    renderSets();
    updateScoreboard();
}

// ==================== RENDER: HISTORY ====================
function renderHistory() {
    const listEl = document.getElementById('history-list');
    const emptyEl = document.getElementById('history-empty');

    if (state.matches.length === 0) {
        listEl.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }

    emptyEl.classList.add('hidden');

    // Show newest first
    const sorted = [...state.matches].reverse();

    listEl.innerHTML = sorted.map(match => {
        const teamA = getTeam(match.teamAId);
        const teamB = getTeam(match.teamBId);
        if (!teamA || !teamB) return '';

        const nameA = teamA.name;
        const nameB = teamB.name;

        // Points awarded
        const ptsA = (match.winner === 'a' ? 3 : 1) + (match.bestFighter && match.bestFighter.teamId === match.teamAId ? 1 : 0);
        const ptsB = (match.winner === 'b' ? 3 : 1) + (match.bestFighter && match.bestFighter.teamId === match.teamBId ? 1 : 0);

        // Set details
        const setsHtml = match.sets.map((set, si) => {
            const combatsHtml = set.combats.map((c, ci) => {
                const winLabel = c.winner === 'a' ? nameA : nameB;
                return `<span class="history-combat">${winLabel} <span class="kills-info">(${c.killsA}-${c.killsB})</span></span>`;
            }).join(' ');
            const setWinnerName = set.winner === 'a' ? nameA : nameB;
            return `<div class="history-set-row">
                <span class="history-set-label">Set ${si + 1}</span>
                <span style="color:var(--text-secondary);font-size:0.8rem;margin-right:8px;">→ ${escHtml(setWinnerName)}</span>
                ${combatsHtml}
            </div>`;
        }).join('');

        const bestFighterTeamName = match.bestFighter ? (getTeam(match.bestFighter.teamId)?.name || '?') : '?';

        return `<div class="history-card" data-id="${match.id}">
            <div class="history-card-header" onclick="toggleHistoryCard('${match.id}')">
                <div class="history-match-teams">
                    <span class="history-team-name ${match.winner === 'a' ? 'is-winner' : ''}">${escHtml(nameA)}</span>
                    <span class="history-match-score">${match.setsWonA} - ${match.setsWonB}</span>
                    <span class="history-team-name ${match.winner === 'b' ? 'is-winner' : ''}">${escHtml(nameB)}</span>
                </div>
                <div class="history-meta">
                    <span>🏅 ${ptsA} pts - ${ptsB} pts</span>
                    <span>📅 ${formatDate(match.date)}</span>
                    ${isAdmin ? `<button class="history-delete-btn" onclick="event.stopPropagation(); deleteMatch('${match.id}')">🗑️</button>` : ''}
                </div>
            </div>
            <div class="history-card-body" id="hbody-${match.id}">
                ${setsHtml}
                <div class="history-bonus">🌟 Meilleur combattant : ${match.bestFighter ? escHtml(match.bestFighter.name) : '—'} (${escHtml(bestFighterTeamName)}) → +1 pt</div>
                <div class="history-points-summary">
                    Kills : <strong>${escHtml(nameA)}</strong> ${match.totalKillsA} — <strong>${escHtml(nameB)}</strong> ${match.totalKillsB}
                </div>
            </div>
        </div>`;
    }).join('');
}

function toggleHistoryCard(matchId) {
    const body = document.getElementById(`hbody-${matchId}`);
    if (body) body.classList.toggle('open');
}

async function deleteMatch(matchId) {
    const confirmed = await confirmDialog('Supprimer le match', 'Êtes-vous sûr de vouloir supprimer ce match ? Le classement sera recalculé.');
    if (!confirmed) return;

    state.matches = state.matches.filter(m => m.id !== matchId);
    saveState();

    renderHistory();
    renderRanking();
    showToast('Match supprimé');
}

// ==================== EXPORT / IMPORT / RESET ====================
function exportData() {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arena2v2_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Données exportées !', 'info');
}

function importData() {
    document.getElementById('import-file').click();
}

function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.teams || !data.matches) {
                showToast('Fichier invalide', 'error');
                return;
            }
            state.teams = data.teams;
            state.matches = data.matches;
            saveState();
            renderAll();
            showToast('Données importées avec succès !');
        } catch (err) {
            showToast('Erreur lors de l\'import', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

async function resetAll() {
    const confirmed = await confirmDialog(
        'Tout réinitialiser',
        'Êtes-vous sûr de vouloir supprimer TOUTES les données ? Cette action est irréversible.'
    );
    if (!confirmed) return;

    state.teams = [];
    state.matches = [];
    saveState();
    renderAll();
    resetMatchForm();
    showToast('Toutes les données ont été supprimées', 'info');
}

// ==================== RENDER ALL ====================
function renderAll() {
    renderRanking();
    renderTeams();
    renderHistory();
    populateTeamSelects();

    document.getElementById('stat-teams').textContent = state.teams.length;
    document.getElementById('stat-matches').textContent = state.matches.length;
}

// ==================== EVENT BINDINGS ====================
function initEvents() {
    // Navigation
    initNav();

    // Teams
    document.getElementById('btn-add-team').addEventListener('click', addTeam);
    document.getElementById('input-team-name').addEventListener('keydown', e => { if (e.key === 'Enter') addTeam(); });
    document.getElementById('input-member-1').addEventListener('keydown', e => { if (e.key === 'Enter') addTeam(); });
    document.getElementById('input-member-2').addEventListener('keydown', e => { if (e.key === 'Enter') addTeam(); });

    // Match team selects
    document.getElementById('select-team-a').addEventListener('change', onTeamSelectChange);
    document.getElementById('select-team-b').addEventListener('change', onTeamSelectChange);

    // Match flow
    document.getElementById('btn-start-match').addEventListener('click', startMatch);
    document.getElementById('btn-cancel-match').addEventListener('click', cancelMatch);
    document.getElementById('btn-save-match').addEventListener('click', saveMatch);
    document.getElementById('btn-back-to-sets').addEventListener('click', backToSets);

    // Admin Lock
    const adminLock = document.getElementById('btn-admin-lock');
    if (adminLock) {
        adminLock.addEventListener('click', toggleAdminMode);
    }

    // Actualiser / Sync
    const btnSync = document.getElementById('btn-sync');
    if (btnSync) {
        btnSync.addEventListener('click', () => loadOnlineSyncData(false));
    }

    // Footer
    document.getElementById('btn-export').addEventListener('click', exportData);
    document.getElementById('btn-import').addEventListener('click', importData);
    document.getElementById('import-file').addEventListener('change', handleImport);
    document.getElementById('btn-reset-all').addEventListener('click', resetAll);
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
    checkAdminStatus();
    initOnlineSync();
    initEvents();
    updateAdminUI();
    renderAll();
});
