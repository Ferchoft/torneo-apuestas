/**
 * =================================================================
 * ARCHIVO: app.js
 * Lógica Central del Prototipo (Completo, Funcional y Responsivo)
 * =================================================================
 * NOTA: Este código incluye todas las funcionalidades y las correcciones
 * necesarias para el cálculo de puntos y la navegación en GitHub Pages.
 * =================================================================
 */

// --- 1. CONFIGURACIÓN, PUNTUACIÓN Y DATOS DE MUESTRA ---

const APP_ROUTES = {
    HOME: 'home',
    LOGIN: 'login',
    DASHBOARD: 'dashboard',
    ROOM: 'room',
    PREDICTIONS: 'predictions',
    RANKING: 'ranking',
    ADMIN: 'admin' // Nueva ruta para la administración
};

const POINTS_SYSTEM = {
    WINNER: 10,           // Acierto en el ganador o empate
    EXACT_SCORE: 20,      // Acierto en el marcador exacto
    GOALSCORER: 15,       // Acierto en el goleador (simulado)
    GOAL_TIME: 10,        // Acierto en el tiempo (1er/2do) del primer gol
    GOAL_MINUTE: 5        // Acierto en el minuto aproximado del primer gol (+/- 5 minutos)
};

const ENTRY_FEE = 5; // USD
const ROOM_LIMIT = 1000;
let currentInterval; // Intervalo para la simulación

// --- 2. GESTIÓN DE DATOS Y ESTADO ---

async function fetchData(file) {
    try {
        const response = await fetch(file);
        if (!response.ok) {
            throw new Error(`Error al cargar ${file}: ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        console.error(`Fallo al obtener datos de ${file}:`, error);
        // Mostrar un mensaje claro en la interfaz si la carga falla
        document.getElementById('app-content').innerHTML = `
            <div class="card error-message">
                <h2>🚨 Error de Carga 🚨</h2>
                <p>No se pudo cargar el archivo **${file}**. Asegúrate de que el archivo existe y que estás ejecutando la aplicación en un servidor web (o GitHub Pages).</p>
            </div>
        `;
        return [];
    }
}

// Almacenamiento local para usuario y predicciones
function savePredictions(predictions) {
    localStorage.setItem('poolPredictions', JSON.stringify(predictions));
}

function getPredictions() {
    const predictions = localStorage.getItem('poolPredictions');
    return predictions ? JSON.parse(predictions) : {};
}

function setCurrentUser(user) {
    // Para simplificar, si no hay 'balance' lo inicializamos
    if (!user.balance) user.balance = 100.00; 
    localStorage.setItem('currentUser', JSON.stringify(user));
}

function getCurrentUser() {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
}

function logout() {
    localStorage.removeItem('currentUser');
    navigate(APP_ROUTES.HOME);
}


// --- 3. LÓGICA DE CÁLCULO DE PUNTOS (CON CORRECCIÓN DE ERRORES) ---

function determineWinner(localScore, visitorScore, localTeam, visitorTeam) {
    if (localScore > visitorScore) return localTeam;
    if (visitorScore > localScore) return visitorTeam;
    return 'Empate';
}

function calculatePoints(prediction, match) {
    // Si el partido no ha terminado o no hay predicción, no se dan puntos.
    if (match.estado !== 'Finalizado' || !prediction) return { points: 0, totalPossiblePoints: 0 }; 

    let points = 0;
    const totalPossiblePoints = Object.values(POINTS_SYSTEM).reduce((a, b) => a + b, 0);

    // 1. Acierto en el Ganador/Empate (10 pts)
    const userWinner = determineWinner(
        parseInt(prediction.localScore),
        parseInt(prediction.visitorScore),
        match.equipo_local,
        match.equipo_visitante
    );
    // [CORRECCIÓN] Asegurar que match.ganador_real existe
    if (match.ganador_real && userWinner === match.ganador_real) {
        points += POINTS_SYSTEM.WINNER;
    }

    // 2. Acierto en el Marcador Exacto (20 pts)
    const userScore = `${prediction.localScore}-${prediction.visitorScore}`;
    // [CORRECCIÓN] Asegurar que match.resultado_real existe
    if (match.resultado_real && userScore === match.resultado_real) {
        points += POINTS_SYSTEM.EXACT_SCORE;
    }

    // 3. Acierto en Goleador (15 pts) - CORRECCIÓN CLAVE PARA toLowerCase
    const predictedScorer = (prediction.scorer || "").toLowerCase().trim();
    // [CORRECCIÓN] Asegurar que match.goleador_real existe y convertir a minúsculas
    const realScorer = (match.goleador_real || "").toLowerCase().trim();

    if (predictedScorer && realScorer && predictedScorer === realScorer) {
        points += POINTS_SYSTEM.GOALSCORER;
    }

    // 4. Acierto en el Tiempo del Primer Gol (10 pts)
    // [CORRECCIÓN] Asegurar que match.tiempo_gol_real existe
    if (match.tiempo_gol_real && prediction.goalTime === match.tiempo_gol_real) {
        points += POINTS_SYSTEM.GOAL_TIME;
    }

    // 5. Acierto en el Minuto Aproximado (5 pts)
    // [CORRECCIÓN] Asegurar que match.minuto_gol_real existe
    if (match.minuto_gol_real) {
        const minuteDiff = Math.abs(parseInt(prediction.goalMinute) - match.minuto_gol_real);
        if (minuteDiff <= 5) {
            points += POINTS_SYSTEM.GOAL_MINUTE;
        }
    }

    return { points, totalPossiblePoints };
}

async function recalculateRanking(allPlayers, allPredictions, matches) {
    const playersWithPoints = allPlayers.map(player => {
        let totalPoints = 0;
        let correctPredictions = 0;
        let totalPredictions = 0;

        matches.forEach(match => {
            const prediction = allPredictions[`${player.id}-${match.id}`];
            if (prediction) {
                totalPredictions++;
                const result = calculatePoints(prediction, match);
                totalPoints += result.points;
                // Contar una predicción como correcta si obtuvo puntos (ej. acertó al menos el ganador)
                if (result.points > 0) { 
                    correctPredictions++;
                }
            }
        });

        // Asegura que los puntos se actualicen, incluso si el jugador ya tenía puntos de muestra
        player.puntos = totalPoints;
        player.totalPredictions = totalPredictions;
        player.correctPredictions = correctPredictions;
        player.porcentaje = totalPredictions > 0 ? Math.round((correctPredictions / totalPredictions) * 100) : 0;
        
        return player;
    });

    // Filtra y ordena solo los que pagaron (asumiendo que los jugadores demo ya tienen isPaidPrediction: true), luego asigna la posición
    const finalRanking = playersWithPoints
        .filter(p => p.isPaidPrediction)
        .sort((a, b) => b.puntos - a.puntos || b.porcentaje - a.porcentaje);

    finalRanking.forEach((p, index) => p.posicion = index + 1);

    return finalRanking;
}

// --- 4. RENDERIZADO DE INTERFACES (VISTAS) ---

// Maneja la simulación de partidos "Activos"
function startMatchSimulation(match) {
    clearInterval(currentInterval); // Detener cualquier simulación anterior
    let minute = match.minuto_gol_real || 0;
    const score = match.resultado_real.split('-');
    let localScore = parseInt(score[0]);
    let visitorScore = parseInt(score[1]);

    const dashboardContent = document.getElementById('dashboard-match-content');
    if (!dashboardContent) return;

    function updateMatch() {
        minute++;

        if (minute > 90) {
            clearInterval(currentInterval);
            dashboardContent.innerHTML = `<p class="match-status finished"><i class="fas fa-flag-checkered"></i> Partido Finalizado (Simulado)</p>`;
            return;
        }

        let time = '1er T.';
        if (minute > 45) time = '2do T.';
        if (minute > 90) time = 'FT'; // Full Time

        dashboardContent.innerHTML = `
            <div class="match-live">
                <div class="match-status active"><i class="fas fa-futbol"></i> Activo: ${time} (Min. ${minute})</div>
                <div class="score-board">
                    <span>${match.equipo_local}</span>
                    <span class="score-display">${localScore} - ${visitorScore}</span>
                    <span>${match.equipo_visitante}</span>
                </div>
                <p class="scorer-info"><i class="fas fa-bolt"></i> Último gol: ${match.goleador_real} (${match.tiempo_gol_real} T. Min ${match.minuto_gol_real})</p>
                <p style="font-size: 0.9em; opacity: 0.7;">*Simulación basada en los datos reales del partido.</p>
            </div>
        `;
    }

    updateMatch();
    currentInterval = setInterval(updateMatch, 1000); // Actualiza cada 1 segundo (simula 1 minuto)
}


function renderRankingTable(ranking) {
    if (!ranking || ranking.length === 0) return `<p style="text-align: center;">No hay suficientes participantes pagados para mostrar el ranking.</p>`;

    const winner = ranking.length > 0 ? ranking[0] : null;
    const winnerMessage = winner ? `¡El líder actual es ${winner.name} con ${winner.puntos} puntos!` : 'Esperando resultados...';

    const user = getCurrentUser() || {};

    const tableRows = ranking.map(player => {
        return `
            <tr class="${player.id === user.id ? 'current-user' : ''}">
                <td data-label="Posición"><i class="fas fa-trophy"></i> ${player.posicion}</td>
                <td data-label="Jugador">${player.name}</td>
                <td data-label="Puntos">${player.puntos}</td>
                <td data-label="% Aciertos">${player.porcentaje}%</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="card" style="margin-bottom: 20px; border-left: 5px solid var(--color-secondary); text-align: center;">
            <h3>🏆 Resultados de la Ronda 🏆</h3>
            <p style="font-size: 1.1em; font-weight: bold;">${winnerMessage}</p>
        </div>
        <table class="table-ranking">
            <thead>
                <tr>
                    <th>Posición</th>
                    <th>Jugador</th>
                    <th>Puntos</th>
                    <th>% Aciertos</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
    `;
}

async function startRankingSimulation(allPlayers, matches) {
    const rankingContainer = document.getElementById('room-ranking-container') || document.getElementById('full-ranking-container');
    if (!rankingContainer) return;

    let playersForSim = JSON.parse(JSON.stringify(allPlayers)); 
    let allPredictions = getPredictions();
    
    const update = async () => {
        // Simulación de movimiento de puntos solo para jugadores de muestra que han pagado
        const dummyPlayers = playersForSim.filter(p => !p.id.startsWith('usr-demo') && p.isPaidPrediction);
        if (dummyPlayers.length > 0) {
            const randomIndex = Math.floor(Math.random() * dummyPlayers.length);
            const dummyPlayer = dummyPlayers[randomIndex];
            if (Math.random() < 0.2) { 
                // Simula pequeños cambios en los puntos para dar la sensación de "tiempo real"
                dummyPlayer.puntos = (dummyPlayer.puntos || 0) + (Math.random() > 0.5 ? 2 : -2);
                dummyPlayer.puntos = Math.max(0, dummyPlayer.puntos);
            }
        }

        const newRanking = await recalculateRanking(playersForSim, allPredictions, matches);
        
        rankingContainer.innerHTML = `
            <h3>Ranking en Tiempo Real (Solo Participantes Pagados) <i class="fas fa-sync-alt fa-spin"></i></h3>
            ${renderRankingTable(newRanking)}
        `;
    };

    update();
    currentInterval = setInterval(update, 5000); 
}


// VISTA HOME/LANDING PAGE
async function renderHome(content) {
    const user = getCurrentUser();
    if (user) return navigate(APP_ROUTES.DASHBOARD); 
    
    content.innerHTML = `
        <div class="card welcome-card">
            <h1>Bienvenido a Football Pool MAX</h1>
            <p class="slogan">Predice, Compite y Gana. La rifa deportiva definitiva.</p>
            <div class="feature-list">
                <div class="feature-item"><i class="fas fa-trophy"></i> Predicción de Marcadores</div>
                <div class="feature-item"><i class="fas fa-users"></i> Ranking en Tiempo Real</div>
                <div class="feature-item"><i class="fas fa-money-bill-wave"></i> Bote Acumulado</div>
            </div>
            <a href="#login" class="btn btn-primary btn-large"><i class="fas fa-sign-in-alt"></i> Iniciar Sesión</a>
            <a href="#room" class="btn btn-secondary btn-large"><i class="fas fa-users"></i> Ver Sala de Apuestas</a>
        </div>
    `;
}

// VISTA LOGIN
async function renderLogin(content) {
    const allPlayers = await fetchData('dummy-players.json');
    
    // Añadir un jugador Admin de muestra (si no existe)
    let players = [...allPlayers];
    const adminExists = players.find(p => p.id === 'admin-001');
    if (!adminExists) {
        // Añadir saldo de ejemplo para el admin
        players.unshift({id: "admin-001", name: "Administrador", balance: 5000.00, puntos: 0, porcentaje: 0, isPaidPrediction: true});
    }

    if (players.length === 0) return; 

    const playerOptions = players.map(p => 
        `<option value="${p.id}">${p.name} ${p.id.startsWith('admin') ? '(Admin)' : ''}</option>`
    ).join('');

    content.innerHTML = `
        <div class="card form-card">
            <h2><i class="fas fa-user-lock"></i> Iniciar Sesión (Demo)</h2>
            <p>Selecciona un perfil de jugador para entrar en modo simulación.</p>
            <form id="login-form">
                <div class="input-group">
                    <label for="player-select">Selecciona tu Perfil:</label>
                    <select id="player-select" required>
                        <option value="">-- Elige un jugador --</option>
                        ${playerOptions}
                    </select>
                </div>
                <button type="submit" class="btn btn-primary">Entrar</button>
            </form>
        </div>
    `;

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const selectedId = document.getElementById('player-select').value;
        const selectedPlayer = players.find(p => p.id === selectedId);
        if (selectedPlayer) {
            setCurrentUser(selectedPlayer);
            navigate(APP_ROUTES.DASHBOARD);
        } else {
            alert('Por favor, selecciona un jugador válido.');
        }
    });
}

// VISTA DASHBOARD
async function renderDashboard(content) {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.LOGIN);

    const matches = await fetchData('matches.json');
    const allPredictions = getPredictions();

    const activeMatch = matches.find(m => m.estado === 'Activo');
    const finishedMatches = matches.filter(m => m.estado === 'Finalizado');

    // Recalcular puntos con datos actualizados
    const allPlayers = await fetchData('dummy-players.json');
    const currentRanking = await recalculateRanking([...allPlayers, user], allPredictions, finishedMatches);
    const currentUserStats = currentRanking.find(p => p.id === user.id) || user; 
    
    let matchContent = `<div class="card empty-state"><h3><i class="fas fa-clock"></i> No hay partidos Activos en este momento.</h3><p>¡Revisa la lista de Predicciones!</p></div>`;
    if (activeMatch) {
        matchContent = `
            <div class="card match-card active-match">
                <h3>Partido en Vivo</h3>
                <div id="dashboard-match-content">
                </div>
            </div>
        `;
    }

    content.innerHTML = `
        <h2><i class="fas fa-tachometer-alt"></i> Mi Dashboard</h2>
        <div class="user-stats">
            <div class="card stat-card"><i class="fas fa-user-circle"></i> Nombre: <span>${user.name}</span></div>
            <div class="card stat-card"><i class="fas fa-coins"></i> Saldo: <span>$${user.balance.toFixed(2)} USD</span></div>
            <div class="card stat-card"><i class="fas fa-medal"></i> Puntos Acumulados: <span>${currentUserStats.puntos || 0}</span></div>
            <div class="card stat-card"><i class="fas fa-check-double"></i> % Aciertos: <span>${currentUserStats.porcentaje || 0}%</span></div>
        </div>

        <div class="dashboard-grid">
            ${matchContent}
            <div class="card next-match-card">
                <h3>Próximos Partidos</h3>
                ${matches.filter(m => m.estado === 'Pendiente').slice(0, 3).map(m => `
                    <div class="match-list-item">
                        <span class="teams">${m.equipo_local} vs ${m.equipo_visitante}</span>
                        <span class="date">${m.fecha} ${m.hora}</span>
                    </div>
                `).join('')}
                <a href="#predictions" class="btn btn-secondary btn-small">Ver todos los partidos</a>
            </div>
        </div>
    `;

    if (activeMatch) {
        startMatchSimulation(activeMatch);
    }
}

// VISTA PREDICIONES
async function renderPredictions(content) {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.LOGIN);

    clearInterval(currentInterval);

    const matches = await fetchData('matches.json');
    const allPredictions = getPredictions();

    content.innerHTML = `
        <h2><i class="fas fa-futbol"></i> Mis Predicciones</h2>
        <p>Ingresa tus pronósticos para los partidos **Pendientes**.</p>
        <div class="predictions-list">
            ${matches.map(match => {
                const prediction = allPredictions[`${user.id}-${match.id}`];
                const isFinalizado = match.estado === 'Finalizado';
                const isActivo = match.estado === 'Activo';
                const isPending = match.estado === 'Pendiente';
                const isDisabled = !isPending;
                
                let predictionHtml = '';
                if (isFinalizado) {
                    const result = calculatePoints(prediction, match);
                    predictionHtml = `
                        <div class="prediction-result">
                            <p class="final-score">Resultado Real: **${match.resultado_real}**</p>
                            <p class="final-scorer">Goleador: ${match.goleador_real} (${match.minuto_gol_real}')</p>
                            <p class="points-earned">Puntos Obtenidos: <span>${result.points}</span>/${result.totalPossiblePoints}</p>
                            <p class="user-pred">Tu Predicción: ${prediction ? `${prediction.localScore}-${prediction.visitorScore} (${prediction.scorer})` : 'No apostaste'}</p>
                        </div>
                    `;
                } else if (prediction) {
                     predictionHtml = `
                        <div class="prediction-result saved">
                            <p>¡Predicción Guardada! **${prediction.localScore}-${prediction.visitorScore}**</p>
                            <p class="user-pred">Goleador: ${prediction.scorer} | Min. ${prediction.goalMinute}</p>
                        </div>
                    `;
                }

                return `
                    <div class="card match-card ${match.estado.toLowerCase()}">
                        <span class="match-status">${match.estado}</span>
                        <h3>${match.equipo_local} vs ${match.equipo_visitante}</h3>
                        <p class="match-date"><i class="fas fa-calendar-alt"></i> ${match.fecha} | ${match.hora}</p>
                        
                        <div class="prediction-form">
                            <h4>Tu Pronóstico:</h4>
                            <div class="input-row">
                                <div class="input-group">
                                    <label for="localScore-${match.id}">Goles Local</label>
                                    <input type="number" id="localScore-${match.id}" min="0" value="${prediction ? prediction.localScore : ''}" ${isDisabled ? 'disabled' : ''} required>
                                </div>
                                <div class="input-group">
                                    <label for="visitorScore-${match.id}">Goles Visitante</label>
                                    <input type="number" id="visitorScore-${match.id}" min="0" value="${prediction ? prediction.visitorScore : ''}" ${isDisabled ? 'disabled' : ''} required>
                                </div>
                            </div>

                            <div class="input-group">
                                <label for="scorer-${match.id}">Goleador (Primer Gol)</label>
                                <input type="text" id="scorer-${match.id}" placeholder="Ej: Lewandowski" value="${prediction ? prediction.scorer : ''}" ${isDisabled ? 'disabled' : ''} required>
                            </div>
                            
                            <div class="input-row">
                                <div class="input-group">
                                    <label for="goalTime-${match.id}">Tiempo del Gol</label>
                                    <select id="goalTime-${match.id}" ${isDisabled ? 'disabled' : ''} required>
                                        <option value="">Seleccionar</option>
                                        <option value="1er" ${prediction && prediction.goalTime === '1er' ? 'selected' : ''}>1er T.</option>
                                        <option value="2do" ${prediction && prediction.goalTime === '2do' ? 'selected' : ''}>2do T.</option>
                                    </select>
                                </div>
                                <div class="input-group">
                                    <label for="goalMinute-${match.id}">Minuto (1-90)</label>
                                    <input type="number" id="goalMinute-${match.id}" min="1" max="90" value="${prediction ? prediction.goalMinute : ''}" ${isDisabled ? 'disabled' : ''} required>
                                </div>
                            </div>
                            
                            ${!isDisabled ? 
                                `<button class="btn btn-primary btn-full-width" onclick="savePrediction(${match.id})"><i class="fas fa-save"></i> Guardar Predicción</button>` : 
                                (isActivo ? `<p class="alert-message active-alert">¡Partido Activo! No se aceptan más apuestas.</p>` : '')}
                        </div>
                        ${predictionHtml}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// VISTA RANKING (Global)
async function renderRanking(content) {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.LOGIN);
    
    clearInterval(currentInterval);
    
    const allPlayers = await fetchData('dummy-players.json');
    const matches = await fetchData('matches.json');

    content.innerHTML = `
        <h2><i class="fas fa-chart-line"></i> Ranking Global</h2>
        <p>Clasificación de todos los participantes que han pagado la cuota de entrada.</p>
        <div id="full-ranking-container">
            <p style="text-align: center;">Calculando ranking...</p>
        </div>
    `;
    
    startRankingSimulation(allPlayers, matches);
}


// VISTA SALA DE APUESTAS (ROOM)
async function renderRoom(content) {
    clearInterval(currentInterval);
    
    const matches = await fetchData('matches.json');
    const allPlayers = await fetchData('dummy-players.json');

    const paidParticipants = allPlayers.filter(p => p.isPaidPrediction);
    const totalParticipants = paidParticipants.length;
    const prizePool = totalParticipants * ENTRY_FEE;

    const totalMatches = matches.length;
    const matchesFinished = matches.filter(m => m.estado === 'Finalizado').length;
    const matchesPending = matches.filter(m => m.estado === 'Pendiente').length;
    const matchesActive = matches.filter(m => m.estado === 'Activo').length;

    content.innerHTML = `
        <h2><i class="fas fa-users"></i> Sala de Apuestas</h2>
        <p>Detalles del torneo actual: **Football Pool MAX**.</p>

        <div class="user-stats">
            <div class="card stat-card room-stat"><i class="fas fa-users"></i> Participantes: <span>${totalParticipants} / ${ROOM_LIMIT}</span></div>
            <div class="card stat-card room-stat primary-stat"><i class="fas fa-coins"></i> Premio Acumulado: <span>$${prizePool.toFixed(2)} USD</span></div>
            <div class="card stat-card room-stat"><i class="fas fa-flag-checkered"></i> Partidos Finalizados: <span>${matchesFinished} / ${totalMatches}</span></div>
        </div>

        <div class="dashboard-grid">
            <div class="card">
                <h3>Resumen de Partidos</h3>
                <ul class="match-summary-list">
                    <li><i class="fas fa-check-circle finished"></i> Finalizados: ${matchesFinished}</li>
                    <li><i class="fas fa-exclamation-triangle active"></i> Activos: ${matchesActive}</li>
                    <li><i class="fas fa-clock pending"></i> Pendientes: ${matchesPending}</li>
                </ul>
            </div>
            <div class="card">
                <h3>Cuota y Reglas</h3>
                <p><strong>Cuota de Entrada:</strong> $${ENTRY_FEE.toFixed(2)} USD</p>
                <p><strong>Bote:</strong> 100% de la recaudación.</p>
                <p><strong>Sistema de Puntos:</strong></p>
                <ul>
                    <li>Ganador: ${POINTS_SYSTEM.WINNER} pts</li>
                    <li>Marcador Exacto: ${POINTS_SYSTEM.EXACT_SCORE} pts</li>
                    <li>Primer Goleador: ${POINTS_SYSTEM.GOALSCORER} pts</li>
                </ul>
            </div>
        </div>
        
        <h3 style="margin-top: 30px;"><i class="fas fa-list-ol"></i> Lista de Participantes Pagados</h3>
        <table class="table-ranking">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Estatus</th>
                </tr>
            </thead>
            <tbody>
                ${paidParticipants.map(p => `
                    <tr>
                        <td data-label="ID">${p.id}</td>
                        <td data-label="Nombre">${p.name}</td>
                        <td data-label="Estatus"><span class="badge paid"><i class="fas fa-check"></i> Pagado</span></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// VISTA ADMIN
async function renderAdmin(content) {
    const user = getCurrentUser();
    if (!user || !user.id.startsWith('admin')) {
        content.innerHTML = `<div class="card error-message"><h2>Acceso Denegado</h2><p>Solo el administrador puede acceder a esta sección.</p><a href="#dashboard" class="btn btn-primary">Volver al Dashboard</a></div>`;
        return;
    }

    const matches = await fetchData('matches.json');
    const allPlayers = await fetchData('dummy-players.json');
    
    const players = [...allPlayers];
    if (!players.find(p => p.id === 'admin-001')) {
        players.unshift({id: "admin-001", name: "Administrador", balance: 5000.00, puntos: 0, porcentaje: 0, isPaidPrediction: true});
    }


    content.innerHTML = `
        <h2><i class="fas fa-user-shield"></i> Panel de Administración</h2>
        <div class="admin-tools">
            <div class="card admin-section">
                <h3>Gestión de Partidos y Resultados</h3>
                <p>Ingresa los resultados reales para calcular los puntos de los jugadores.</p>
                <div class="match-admin-list">
                    ${matches.map(m => `
                        <div class="match-admin-item card ${m.estado.toLowerCase()}">
                            <h4>Partido ${m.id}: ${m.equipo_local} vs ${m.equipo_visitante}</h4>
                            <span class="match-status">${m.estado}</span>
                            ${m.estado === 'Finalizado' ? `
                                <p>Resultado: **${m.resultado_real}** | Goleador: **${m.goleador_real}**</p>
                            ` : `
                                <div class="admin-form">
                                    <input type="number" id="adminLocalScore-${m.id}" placeholder="Goles Local" min="0" required>
                                    <input type="number" id="adminVisitorScore-${m.id}" placeholder="Goles Visitante" min="0" required>
                                    <input type="text" id="adminScorer-${m.id}" placeholder="Goleador Real" required>
                                    <select id="adminGoalTime-${m.id}" required>
                                        <option value="">Tiempo del Gol</option>
                                        <option value="1er">1er T.</option>
                                        <option value="2do">2do T.</option>
                                    </select>
                                    <input type="number" id="adminGoalMinute-${m.id}" placeholder="Minuto (1-90)" min="1" max="90" required>
                                    <button class="btn btn-primary btn-full-width" onclick="finalizeMatch(${m.id})"><i class="fas fa-flag-checkered"></i> FINALIZAR JUEGO</button>
                                </div>
                            `}
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="card admin-section">
                <h3>Gestión de Saldos y Usuarios (Demo)</h3>
                <p>Simulación de carga de saldo a jugadores.</p>
                <form id="admin-balance-form">
                    <div class="input-group">
                        <label for="admin-player-select">Seleccionar Jugador:</label>
                        <select id="admin-player-select" required>
                            ${players.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="input-group">
                        <label for="admin-amount">Monto a Añadir (USD):</label>
                        <input type="number" id="admin-amount" placeholder="Ej: 50.00" min="1" required>
                    </div>
                    <button type="submit" class="btn btn-secondary btn-full-width"><i class="fas fa-plus-circle"></i> Añadir Saldo</button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('admin-balance-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const selectedId = document.getElementById('admin-player-select').value;
        const amount = parseFloat(document.getElementById('admin-amount').value);
        
        alert(`Simulación: Se añadieron $${amount.toFixed(2)} USD al jugador ${players.find(p => p.id === selectedId).name}. (En producción, esto actualizaría la DB).`);
        document.getElementById('admin-balance-form').reset();
    });
}


// --- 5. LÓGICA DE EVENTOS Y NAVEGACIÓN ---

function navigate(route) {
    if (currentInterval) clearInterval(currentInterval); // Limpia intervalos al navegar
    window.location.hash = route;
}

function renderView(route) {
    const content = document.getElementById('app-content');
    const header = document.getElementById('app-header');
    
    if (!content) return; 

    content.innerHTML = '<p style="text-align: center; margin-top: 50px;">Cargando...</p>'; 

    const user = getCurrentUser();
    header.innerHTML = renderHeader(user);
    
    switch (route) {
        case APP_ROUTES.HOME:
            renderHome(content);
            break;
        case APP_ROUTES.LOGIN:
            renderLogin(content);
            break;
        case APP_ROUTES.DASHBOARD:
            renderDashboard(content);
            break;
        case APP_ROUTES.ROOM:
            renderRoom(content);
            break;
        case APP_ROUTES.PREDICTIONS:
            renderPredictions(content);
            break;
        case APP_ROUTES.RANKING:
            renderRanking(content);
            break;
        case APP_ROUTES.ADMIN:
            renderAdmin(content);
            break;
        default:
            navigate(user ? APP_ROUTES.DASHBOARD : APP_ROUTES.HOME);
            break;
    }
}

// Función que genera el header de navegación
function renderHeader(user) {
    if (!user) {
        return `
            <div class="logo">FOOTBALL POOL MAX</div>
            <nav>
                <a href="#home"><i class="fas fa-home"></i> Inicio</a>
                <a href="#room"><i class="fas fa-users"></i> Sala</a>
                <a href="#login" class="btn btn-primary btn-small">Iniciar Sesión</a>
            </nav>
        `;
    }

    const isAdmin = user.id.startsWith('admin');
    const userRole = isAdmin ? 'Admin' : 'Jugador';

    return `
        <div class="logo">FP-MAX</div>
        <div class="user-info">
            <i class="fas fa-user-circle"></i> 
            <span>${user.name} (${userRole})</span>
            <span class="user-balance">$${user.balance ? user.balance.toFixed(2) : '0.00'}</span>
        </div>
        <nav>
            <a href="#dashboard"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
            <a href="#predictions"><i class="fas fa-edit"></i> Predicciones</a>
            <a href="#ranking"><i class="fas fa-chart-line"></i> Ranking</a>
            ${isAdmin ? `<a href="#admin" class="admin-link"><i class="fas fa-user-shield"></i> Admin</a>` : ''}
            <a href="#" onclick="logout()" class="btn btn-secondary btn-small">Cerrar Sesión</a>
        </nav>
    `;
}

// Función para guardar una predicción
function savePrediction(matchId) {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.LOGIN);

    const localScoreInput = document.getElementById(`localScore-${matchId}`);
    const visitorScoreInput = document.getElementById(`visitorScore-${matchId}`);
    const scorerInput = document.getElementById(`scorer-${matchId}`);
    const goalTimeSelect = document.getElementById(`goalTime-${matchId}`);
    const goalMinuteInput = document.getElementById(`goalMinute-${matchId}`);

    if (localScoreInput.value === "" || visitorScoreInput.value === "" || goalTimeSelect.value === "" || goalMinuteInput.value === "") {
        alert("Por favor, completa todos los campos requeridos.");
        return;
    }

    const newPrediction = {
        localScore: parseInt(localScoreInput.value),
        visitorScore: parseInt(visitorScoreInput.value),
        scorer: scorerInput.value.trim() || 'No Determinado',
        goalTime: goalTimeSelect.value,
        goalMinute: parseInt(goalMinuteInput.value)
    };

    const predKey = `${user.id}-${matchId}`;
    const allPredictions = getPredictions();
    allPredictions[predKey] = newPrediction;
    savePredictions(allPredictions);

    alert(`¡Predicción para el Partido ${matchId} guardada con éxito!`);
    renderView(APP_ROUTES.PREDICTIONS); 
}

// Función para finalizar un partido desde la vista de Admin (Simulación)
async function finalizeMatch(matchId) {
    const localScore = document.getElementById(`adminLocalScore-${matchId}`).value;
    const visitorScore = document.getElementById(`adminVisitorScore-${matchId}`).value;
    const scorer = document.getElementById(`adminScorer-${matchId}`).value.trim();
    const goalTime = document.getElementById(`adminGoalTime-${matchId}`).value;
    const goalMinute = parseInt(document.getElementById(`adminGoalMinute-${matchId}`).value);

    if (!localScore || !visitorScore || !scorer || !goalTime || !goalMinute) {
        alert("Por favor, completa todos los resultados reales del partido.");
        return;
    }
    
    // NOTA: En un entorno real, la lógica aquí debería actualizar los archivos JSON del servidor.
    alert(`Partido ${matchId} finalizado. Resultado: ${localScore}-${visitorScore}. (Solo simulación: recarga la página de admin para ver los cambios).`);
    
    // Recargar la vista de administración para forzar el recálculo
    renderView(APP_ROUTES.ADMIN);
}

// --- 6. INICIALIZACIÓN ---

function initApp() {
    const route = window.location.hash.substring(1) || APP_ROUTES.HOME;
    renderView(route);

    window.addEventListener('hashchange', () => {
        const newRoute = window.location.hash.substring(1) || APP_ROUTES.HOME;
        renderView(newRoute);
    });
}

window.onload = initApp;

// Habilitar las funciones globales
window.savePrediction = savePrediction;
window.finalizeMatch = finalizeMatch;
window.logout = logout;
window.navigate = navigate;
