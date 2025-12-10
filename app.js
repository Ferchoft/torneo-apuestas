/**
 * =================================================================
 * ARCHIVO: app.js
 * Lógica Central del Prototipo (Completo, Funcional y Responsivo)
 * INCLUYE: Interfaz de Jugadores y Panel de Administración
 * =================================================================
 * NOTA: Este código asume que los archivos de datos matches.json, 
 * dummy-players.json y team-players.json están ubicados localmente.
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
    ADMIN: 'admin' // <--- RUTA DE ADMINISTRACIÓN
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
let globalMatches = []; // Variable global para almacenar los partidos

// --- 2. GESTIÓN DE DATOS Y ESTADO ---

/**
 * Función que simula la carga de datos de archivos JSON.
 * Prioriza datos guardados localmente (simulaciones de administración).
 */
async function fetchData(file) {
    let data;

    if (file === 'matches.json') {
        // Cargar datos de partidos con prioridad al simulado por la administración
        const simulatedMatches = localStorage.getItem('simulatedMatches');
        if (simulatedMatches) {
            data = JSON.parse(simulatedMatches);
        } else {
            const response = await fetch(file);
            data = await response.json();
            globalMatches = data; // Almacenar en global para referencia
        }
    } else if (file === 'dummy-players.json') {
        // Cargar datos de jugadores con prioridad al simulado por la administración
        const simulatedPlayers = localStorage.getItem('simulatedPlayers');
        if (simulatedPlayers) {
            data = JSON.parse(simulatedPlayers);
        } else {
            const response = await fetch(file);
            data = await response.json();
        }
    } else {
        const response = await fetch(file);
        data = await response.json();
    }
    
    // Si se cargaron datos de partidos por primera vez, inicializar globalMatches
    if (file === 'matches.json' && globalMatches.length === 0) {
        globalMatches = data;
    }
    
    return data;
}

function getCurrentUser() {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
}

function setCurrentUser(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
}

function getPredictions() {
    const predictions = localStorage.getItem('predictions');
    return predictions ? JSON.parse(predictions) : {};
}

function savePredictions(predictions) {
    localStorage.setItem('predictions', JSON.stringify(predictions));
}

// --- 3. LÓGICA DEL JUEGO (PUNTUACIÓN) ---

function determineWinner(localScore, visitorScore, team1Name, team2Name) {
    if (localScore > visitorScore) return team1Name;
    if (visitorScore > localScore) return team2Name;
    return 'Empate';
}

function calculatePoints(prediction, match) {
    let points = 0;
    
    if (match.estado !== 'Finalizado' || !match.resultado_real) {
        return 0; // Solo se calcula la puntuación si el partido ha finalizado
    }

    const [realLocalScore, realVisitorScore] = match.resultado_real.split('-').map(Number);

    // 1. Acierto en el Marcador Exacto
    if (prediction.localScore === realLocalScore && prediction.visitorScore === realVisitorScore) {
        points += POINTS_SYSTEM.EXACT_SCORE;
    } else {
        // 2. Acierto en el Ganador o Empate
        const predictedWinner = determineWinner(prediction.localScore, prediction.visitorScore, match.equipo_local, match.equipo_visitante);
        if (predictedWinner === match.ganador_real) {
            points += POINTS_SYSTEM.WINNER;
        }
    }

    // 3. Acierto en el Goleador (simulado)
    if (prediction.scorer.toLowerCase() === match.goleador_real.toLowerCase()) {
        points += POINTS_SYSTEM.GOALSCORER;
    }

    // 4. Acierto en el Tiempo del Gol
    if (prediction.goalTime === match.tiempo_gol_real) {
        points += POINTS_SYSTEM.GOAL_TIME;
    }

    // 5. Acierto en el Minuto del Gol (+/- 5 minutos)
    if (Math.abs(prediction.goalMinute - match.minuto_gol_real) <= 5) {
        points += POINTS_SYSTEM.GOAL_MINUTE;
    }

    return points;
}

/**
 * Recalcula y actualiza los puntos totales y el porcentaje de acierto de todos los jugadores.
 */
async function recalculateRanking(allPlayers, allPredictions, matches) {
    if (!allPlayers || !matches) return;

    let totalPossiblePoints = 0;

    // Calcular puntos posibles solo para partidos finalizados
    matches.forEach(match => {
        if (match.estado === 'Finalizado') {
            totalPossiblePoints += (POINTS_SYSTEM.EXACT_SCORE + POINTS_SYSTEM.GOALSCORER + POINTS_SYSTEM.GOAL_TIME + POINTS_SYSTEM.GOAL_MINUTE);
        }
    });

    const updatedPlayers = allPlayers.map(player => {
        let totalPoints = 0;
        let totalPlayerPossiblePoints = 0;
        
        matches.forEach(match => {
            const predKey = `${player.id}-${match.id}`;
            const prediction = allPredictions[predKey];

            if (match.estado === 'Finalizado' && prediction) {
                const matchPoints = calculatePoints(prediction, match);
                totalPoints += matchPoints;
                // Si hizo la predicción en un partido finalizado, suma la máxima puntuación posible para el denominador
                totalPlayerPossiblePoints += (POINTS_SYSTEM.EXACT_SCORE + POINTS_SYSTEM.GOALSCORER + POINTS_SYSTEM.GOAL_TIME + POINTS_SYSTEM.GOAL_MINUTE);
            }
        });

        // El porcentaje de acierto es (Puntos obtenidos / Puntos Máximos Posibles donde el jugador predijo)
        const percentage = totalPlayerPossiblePoints > 0 ? Math.round((totalPoints / totalPlayerPossiblePoints) * 100) : 0;

        return {
            ...player,
            puntos: totalPoints,
            porcentaje: percentage
        };
    });

    // Guardar el ranking actualizado (simulación de persistencia)
    localStorage.setItem('simulatedPlayers', JSON.stringify(updatedPlayers));

    // Si el usuario actual es uno de ellos, actualizarlo también
    const currentUser = getCurrentUser();
    if (currentUser) {
        const updatedUser = updatedPlayers.find(p => p.id === currentUser.id);
        if (updatedUser) {
            // Solo actualizar los campos de puntos y porcentaje del objeto currentUser
            setCurrentUser({...currentUser, puntos: updatedUser.puntos, porcentaje: updatedUser.porcentaje});
        }
    }

    return updatedPlayers.sort((a, b) => b.puntos - a.puntos);
}


// --- 4. GESTIÓN DE NAVEGACIÓN Y RENDERIZADO ---

function updateHeader(user) {
    const header = document.getElementById('app-header');
    if (!user) {
        header.innerHTML = `<h1>⚽ Football Pool MAX</h1>`;
        return;
    }

    header.innerHTML = `
        <div class="user-info">
            <span class="user-name"><i class="fas fa-user-circle"></i> ${user.name}</span>
            <span class="user-balance"><i class="fas fa-wallet"></i> Saldo: $${user.balance.toFixed(2)} USD</span>
        </div>
        <nav class="main-nav">
            <a href="#dashboard" onclick="navigate('${APP_ROUTES.DASHBOARD}')"><i class="fas fa-home"></i> Inicio</a>
            <a href="#predictions" onclick="navigate('${APP_ROUTES.PREDICTIONS}')"><i class="fas fa-edit"></i> Predicciones</a>
            <a href="#ranking" onclick="navigate('${APP_ROUTES.RANKING}')"><i class="fas fa-trophy"></i> Ranking</a>
            <a href="#room" onclick="navigate('${APP_ROUTES.ROOM}')"><i class="fas fa-users"></i> Sala</a>
        </nav>
        <button class="btn-logout" onclick="logout()"><i class="fas fa-sign-out-alt"></i> Salir</button>
    `;
}

function navigate(route, data = {}) {
    const content = document.getElementById('app-content');
    const user = getCurrentUser();

    clearInterval(currentInterval); // Limpiar cualquier intervalo activo

    // Si no está logueado y no es la página de inicio/login/admin, redirigir.
    if (!user && route !== APP_ROUTES.HOME && route !== APP_ROUTES.LOGIN && route !== APP_ROUTES.ADMIN) {
        window.location.hash = APP_ROUTES.HOME;
        renderHome(content);
        return;
    }

    window.location.hash = route;
    updateHeader(user);

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
        case APP_ROUTES.PREDICTIONS:
            renderPredictions(content);
            break;
        case APP_ROUTES.ROOM:
            renderRoom(content);
            break;
        case APP_ROUTES.RANKING:
            renderRanking(content);
            break;
        case APP_ROUTES.ADMIN: // <--- CASO PARA LA INTERFAZ DE ADMINISTRACIÓN
            // Solo permitir el acceso al admin si estás logueado para fines de demo
            if (user) { 
                renderAdminPanel(content);
            } else {
                 alert("Acceso denegado. Por favor, inicie sesión primero (solo para demo).");
                 navigate(APP_ROUTES.LOGIN);
            }
            break;
        default:
            renderHome(content);
    }
}

function logout() {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('predictions');
    navigate(APP_ROUTES.HOME);
}


// --- 5. RENDERIZADO DE INTERFACES DEL JUGADOR ---

/**
 * Renderiza la vista de inicio (Landing Page).
 */
function renderHome(content) {
    content.innerHTML = `
        <div class="centered-message">
            <h2>Bienvenido a **Football Pool MAX**</h2>
            <p>Tu plataforma definitiva para predecir marcadores y ganar grandes premios.</p>
            <div class="action-buttons">
                <button class="btn-primary" onclick="navigate('${APP_ROUTES.LOGIN}')"><i class="fas fa-sign-in-alt"></i> Iniciar Sesión</button>
            </div>
            <div class="info-section">
                <h3><i class="fas fa-info-circle"></i> Cómo Jugar</h3>
                <p>Predice el marcador exacto, el ganador, el goleador y el minuto del primer gol para cada partido.</p>
                <h3><i class="fas fa-trophy"></i> Sistema de Puntos</h3>
                <ul>
                    <li>Marcador Exacto: ${POINTS_SYSTEM.EXACT_SCORE} pts</li>
                    <li>Ganador/Empate: ${POINTS_SYSTEM.WINNER} pts</li>
                    <li>Goleador (Simulado): ${POINTS_SYSTEM.GOALSCORER} pts</li>
                    <li>Tiempo del Gol: ${POINTS_SYSTEM.GOAL_TIME} pts</li>
                    <li>Minuto Aproximado: ${POINTS_SYSTEM.GOAL_MINUTE} pts</li>
                </ul>
            </div>
        </div>
    `;
}

/**
 * Renderiza la vista de Login (simulado).
 */
async function renderLogin(content) {
    const players = await fetchData('dummy-players.json');
    const playerOptions = players.map(p => 
        `<option value="${p.id}">${p.name}</option>`
    ).join('');

    content.innerHTML = `
        <div class="centered-message login-card">
            <h2>Iniciar Sesión (Demo)</h2>
            <p>Selecciona tu perfil de jugador para iniciar.</p>
            <div class="form-group">
                <label for="player-select">Seleccionar Jugador:</label>
                <select id="player-select" class="form-control">
                    <option value="">-- Seleccionar --</option>
                    ${playerOptions}
                </select>
            </div>
            <button class="btn-primary" onclick="login()"><i class="fas fa-arrow-right"></i> Entrar</button>
            <p style="margin-top: 20px;"><a href="#" onclick="navigate('${APP_ROUTES.HOME}')">Volver a Inicio</a></p>
        </div>
    `;
}

function login() {
    const select = document.getElementById('player-select');
    const selectedId = select.value;
    if (selectedId) {
        fetchData('dummy-players.json').then(players => {
            const user = players.find(p => p.id === selectedId);
            if (user) {
                setCurrentUser(user);
                navigate(APP_ROUTES.DASHBOARD);
            }
        });
    } else {
        alert("Por favor, selecciona un jugador.");
    }
}

/**
 * Renderiza la vista principal del jugador (Dashboard).
 */
async function renderDashboard(content) {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.HOME);

    const matches = await fetchData('matches.json');
    const predictions = getPredictions();
    const rankedPlayers = await recalculateRanking(await fetchData('dummy-players.json'), predictions, matches);
    
    // Simular partido activo (el primero en estado 'Activo')
    const activeMatch = matches.find(m => m.estado === 'Activo');

    let matchCardHTML = '<div class="card"><p class="text-center">No hay partidos activos en este momento.</p></div>';

    if (activeMatch) {
        const predKey = `${user.id}-${activeMatch.id}`;
        const userPrediction = predictions[predKey];
        // Usar liveScore si existe, si no, usar el resultado_real si el estado es Activo (para la demo)
        const localScore = activeMatch.isLive && activeMatch.liveScore ? activeMatch.liveScore.split('-')[0] : (activeMatch.resultado_real ? activeMatch.resultado_real.split('-')[0] : 0);
        const visitorScore = activeMatch.isLive && activeMatch.liveScore ? activeMatch.liveScore.split('-')[1] : (activeMatch.resultado_real ? activeMatch.resultado_real.split('-')[1] : 0);

        matchCardHTML = `
            <div class="card match-live-card">
                <h3><i class="fas fa-satellite-dish"></i> Partido en Vivo (Simulación)</h3>
                <p class="match-time">${activeMatch.hora} - ${activeMatch.fecha}</p>
                <div class="match-teams">
                    <span class="team-name">${activeMatch.equipo_local}</span>
                    <span class="score" id="live-local-score">${localScore}</span>
                    <span>vs</span>
                    <span class="score" id="live-visitor-score">${visitorScore}</span>
                    <span class="team-name">${activeMatch.equipo_visitante}</span>
                </div>
                ${userPrediction ? `
                    <p class="prediction-info">Tu Predicción: **${userPrediction.localScore}-${userPrediction.visitorScore}**</p>
                ` : `
                    <p class="prediction-info">Aún no has hecho tu predicción.</p>
                `}
                <button class="btn-secondary" onclick="navigate('${APP_ROUTES.PREDICTIONS}')">Ver Todos</button>
            </div>
        `;
        // Iniciar simulación de partido si no está activa
        if (!currentInterval) {
            startLiveSimulation(activeMatch.id);
        }
    }


    content.innerHTML = `
        <div class="dashboard-grid">
            <div class="stats-column">
                <h2>Hola, ${user.name} 👋</h2>
                
                <div class="card stat-card total-points">
                    <i class="fas fa-star"></i>
                    <h4>Puntos Totales</h4>
                    <p class="stat-value">${user.puntos}</p>
                </div>
                
                <div class="card stat-card hit-rate">
                    <i class="fas fa-chart-line"></i>
                    <h4>Tasa de Acierto</h4>
                    <p class="stat-value">${user.porcentaje}%</p>
                </div>

                <div class="card stat-card ranking-position">
                    <i class="fas fa-medal"></i>
                    <h4>Tu Posición</h4>
                    <p class="stat-value">#${rankedPlayers.findIndex(p => p.id === user.id) + 1}</p>
                </div>

                <div class="card stat-card wallet">
                    <i class="fas fa-wallet"></i>
                    <h4>Saldo Disponible</h4>
                    <p class="stat-value">$${user.balance.toFixed(2)} USD</p>
                </div>
            </div>

            <div class="matches-column">
                ${matchCardHTML}
                
                <div class="card next-matches">
                    <h3><i class="fas fa-calendar-alt"></i> Próximos Partidos</h3>
                    ${matches.filter(m => m.estado === 'Pendiente').slice(0, 3).map(m => `
                        <div class="match-item">
                            <span>${m.equipo_local} vs ${m.equipo_visitante}</span>
                            <span>${m.fecha} / ${m.hora}</span>
                        </div>
                    `).join('')}
                    <button class="btn-primary" onclick="navigate('${APP_ROUTES.PREDICTIONS}')">Hacer Predicciones</button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Simulación en tiempo real del marcador
 */
function startLiveSimulation(matchId) {
    const content = document.getElementById('app-content');
    if (!content.querySelector('.match-live-card')) {
        clearInterval(currentInterval);
        return;
    }

    let local = 0;
    let visitor = 0;
    let minute = 0;

    // Buscar el partido en globalMatches
    const matchIndex = globalMatches.findIndex(m => m.id === matchId);
    if (matchIndex === -1) return;
    
    // Inicializar con el resultado real si ya existe (para reanudar la simulación)
    if (globalMatches[matchIndex].resultado_real) {
        [local, visitor] = globalMatches[matchIndex].resultado_real.split('-').map(Number);
    }
    
    globalMatches[matchIndex].isLive = true;
    globalMatches[matchIndex].liveScore = `${local}-${visitor}`;


    currentInterval = setInterval(() => {
        minute++;

        if (minute > 90) {
            clearInterval(currentInterval);
            console.log(`Simulación de Partido ${matchId} terminada. El administrador debe finalizarlo.`);
            return;
        }

        // Simular un gol cada 15 minutos con 10% de probabilidad
        if (minute % 15 === 0 && Math.random() < 0.1) {
            if (Math.random() > 0.5) {
                local++;
            } else {
                visitor++;
            }
        }
        
        // Actualizar datos de la simulación
        globalMatches[matchIndex].liveScore = `${local}-${visitor}`;
        
        // Actualizar la interfaz si el usuario sigue en el dashboard
        const localScoreElement = document.getElementById('live-local-score');
        const visitorScoreElement = document.getElementById('live-visitor-score');
        const minuteElement = content.querySelector('.match-time');
        
        if (localScoreElement && visitorScoreElement) {
            localScoreElement.textContent = local;
            visitorScoreElement.textContent = visitor;
            if (minuteElement) {
                minuteElement.textContent = `Minuto ${minute} / En Curso`;
            }
        }

    }, 1000); // Actualiza cada segundo (simulando 1 minuto de juego)
}

/**
 * Renderiza la vista de predicciones.
 */
async function renderPredictions(content) {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.HOME);

    const matches = await fetchData('matches.json');
    const predictions = getPredictions();
    const teamPlayers = await fetchData('team-players.json');

    const matchItems = matches.map(match => {
        const predKey = `${user.id}-${match.id}`;
        const prediction = predictions[predKey] || {};
        const isFinished = match.estado === 'Finalizado';
        const isPending = match.estado === 'Pendiente';
        const isDisabled = isFinished || !isPending ? 'disabled' : '';
        
        // Determinar jugadores disponibles (simulando lista combinada)
        const players = [...(teamPlayers[match.equipo_local] || []), ...(teamPlayers[match.equipo_visitante] || [])];
        const scorerOptions = players.map(p => 
            `<option value="${p}" ${prediction.scorer === p ? 'selected' : ''}>${p}</option>`
        ).join('');
        
        const finalResult = isFinished ? `
            <div class="real-result">
                <h4>Resultado Real: ${match.resultado_real}</h4>
                <p>Goleador: ${match.goleador_real} (${match.tiempo_gol_real} T, Min ${match.minuto_gol_real})</p>
                <p>Puntos Obtenidos: <b>${calculatePoints(prediction, match)} pts</b></p>
            </div>
        ` : '';

        return `
            <div class="card prediction-match-card ${isFinished ? 'finished' : (isPending ? 'pending' : 'active')}" id="match-card-${match.id}">
                <h3>${match.equipo_local} vs ${match.equipo_visitante}</h3>
                <p class="match-details">${match.fecha} / ${match.hora} - Estado: <b>${match.estado}</b></p>
                
                ${finalResult}

                <div class="prediction-form" ${isFinished ? 'style="display: none;"' : ''}>
                    
                    <div class="score-inputs">
                        <label>${match.equipo_local} Goles:</label>
                        <input type="number" id="localScore-${match.id}" value="${prediction.localScore || 0}" min="0" ${isDisabled}>
                        
                        <label>${match.equipo_visitante} Goles:</label>
                        <input type="number" id="visitorScore-${match.id}" value="${prediction.visitorScore || 0}" min="0" ${isDisabled}>
                    </div>

                    <div class="prediction-detail-inputs">
                        <label for="scorerSelect-${match.id}">Primer Goleador (Simulado):</label>
                        <select id="scorerSelect-${match.id}" ${isDisabled}>
                            <option value="">-- Seleccionar --</option>
                            ${scorerOptions}
                        </select>

                        <label for="goalTime-${match.id}">Tiempo del Gol:</label>
                        <select id="goalTime-${match.id}" ${isDisabled} required>
                            <option value="" ${!prediction.goalTime ? 'selected' : ''}>-- Tiempo --</option>
                            <option value="1er" ${prediction.goalTime === '1er' ? 'selected' : ''}>1er Tiempo</option>
                            <option value="2do" ${prediction.goalTime === '2do' ? 'selected' : ''}>2do Tiempo</option>
                        </select>
                        
                        <label for="goalMinute-${match.id}">Minuto (1-90):</label>
                        <input type="number" id="goalMinute-${match.id}" value="${prediction.goalMinute || ''}" min="1" max="90" placeholder="Min." ${isDisabled} required>
                    </div>

                    <button class="btn-primary" onclick="savePrediction(${match.id})" ${isDisabled}>GUARDAR PREDICCIÓN</button>
                    ${prediction.localScore !== undefined ? `<p class="prediction-saved">✅ Predicción Guardada: **${prediction.localScore}-${prediction.visitorScore}**</p>` : ''}
                </div>
            </div>
        `;
    }).join('');

    content.innerHTML = `
        <h2><i class="fas fa-edit"></i> Haz tus Predicciones</h2>
        <p>Completa el marcador y los detalles del primer gol para cada partido pendiente.</p>
        <div class="predictions-grid">
            ${matchItems}
        </div>
    `;
}

function savePrediction(matchId) {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.HOME);

    const localScoreInput = document.getElementById(`localScore-${matchId}`);
    const visitorScoreInput = document.getElementById(`visitorScore-${matchId}`);
    const scorerInput = document.getElementById(`scorerSelect-${matchId}`);
    const goalTimeSelect = document.getElementById(`goalTime-${matchId}`);
    const goalMinuteInput = document.getElementById(`goalMinute-${matchId}`);

    // Validación de campos requeridos
    if (localScoreInput.value === "" || visitorScoreInput.value === "" || goalTimeSelect.value === "" || goalMinuteInput.value === "") {
        alert("Por favor, completa todos los campos requeridos (marcador, tiempo y minuto del gol) antes de guardar.");
        return;
    }
    
    const minutes = parseInt(goalMinuteInput.value);
    if(minutes < 1 || minutes > 90) {
        alert("El minuto del gol debe estar entre 1 y 90.");
        return;
    }

    const newPrediction = {
        localScore: parseInt(localScoreInput.value),
        visitorScore: parseInt(visitorScoreInput.value),
        scorer: scorerInput.value.trim() || 'No Determinado',
        goalTime: goalTimeSelect.value,
        goalMinute: minutes
    };

    const predKey = `${user.id}-${matchId}`;
    const allPredictions = getPredictions();
    allPredictions[predKey] = newPrediction;
    savePredictions(allPredictions);

    alert(`¡Predicción para el Partido ${matchId} guardada con éxito!`);
    navigate(APP_ROUTES.PREDICTIONS); 
}

/**
 * Renderiza la vista de Sala/Room.
 */
async function renderRoom(content) {
    const players = await fetchData('dummy-players.json');
    const participants = players.filter(p => p.isPaidPrediction);

    content.innerHTML = `
        <div class="room-container">
            <h2><i class="fas fa-users"></i> Sala de Apuestas (Room)</h2>
            <div class="room-stats">
                <div class="card stat-card">
                    <h4>Participantes</h4>
                    <p class="stat-value">${participants.length} / ${ROOM_LIMIT}</p>
                </div>
                <div class="card stat-card">
                    <h4>Premio Acumulado (Simulado)</h4>
                    <p class="stat-value">$${(participants.length * ENTRY_FEE).toFixed(2)} USD</p>
                </div>
            </div>

            <div class="card player-list-card">
                <h3>Lista de Participantes Pagados</h3>
                <ul class="player-list">
                    ${participants.map(p => `<li><i class="fas fa-check-circle paid"></i> ${p.name}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;
}

/**
 * Renderiza la vista del Ranking.
 */
async function renderRanking(content) {
    const matches = await fetchData('matches.json');
    const predictions = getPredictions();
    const rankedPlayers = await recalculateRanking(await fetchData('dummy-players.json'), predictions, matches);
    const user = getCurrentUser();
    
    const rankingRows = rankedPlayers.map((player, index) => {
        const isCurrentUser = user && player.id === user.id ? 'is-current-user' : '';
        const badge = index === 0 ? '<i class="fas fa-crown gold"></i>' : (index === 1 ? '<i class="fas fa-medal silver"></i>' : (index === 2 ? '<i class="fas fa-medal bronze"></i>' : ''));

        return `
            <tr class="${isCurrentUser}">
                <td data-label="Posición">${index + 1}. ${badge}</td>
                <td data-label="Jugador">${player.name}</td>
                <td data-label="Puntos" class="points-col">${player.puntos}</td>
                <td data-label="Acierto">${player.porcentaje}%</td>
            </tr>
        `;
    }).join('');

    content.innerHTML = `
        <h2><i class="fas fa-trophy"></i> Ranking Global</h2>
        <p>Clasificación de jugadores por puntos acumulados en los partidos finalizados.</p>
        
        <div class="card">
            <table class="table-ranking">
                <thead>
                    <tr>
                        <th>Posición</th>
                        <th>Jugador</th>
                        <th>Puntos</th>
                        <th>Acierto (%)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rankingRows}
                </tbody>
            </table>
        </div>
    `;
}


// =================================================================
// --- 5.5. FUNCIONES Y VISTA DEL PANEL ADMINISTRATIVO (ADMIN) ---
// =================================================================

/**
 * Función que simula la actualización de datos persistentes (como localStorage)
 * para los partidos. En un entorno real, esto sería una llamada API de servidor.
 * @param {Array} newMatches - El array de partidos actualizado.
 */
function simulateMatchDataUpdate(newMatches) {
    // Simulación: Actualizar la variable global
    globalMatches = newMatches;
    
    // Simulación: Guardar en localStorage para persistencia básica
    localStorage.setItem('simulatedMatches', JSON.stringify(newMatches));
    
    console.log("Datos de Partidos SIMULADAMENTE actualizados.");
}

/**
 * Función que simula la actualización de datos persistentes para un usuario.
 * @param {string} userId - ID del usuario a actualizar.
 * @param {Object} updateData - Objeto con { balance, isPaidPrediction }.
 */
async function simulateUserDataUpdate(userId, updateData) {
    let allPlayers = await fetchData('dummy-players.json');
    const playerIndex = allPlayers.findIndex(p => p.id === userId);

    if (playerIndex > -1) {
        // Clonar para no modificar la fuente original si es necesario
        let playerToUpdate = {...allPlayers[playerIndex]};
        
        // Aplicar la actualización
        allPlayers[playerIndex] = {
            ...playerToUpdate,
            ...updateData
        };
        
        // Simular la actualización de la lista completa
        localStorage.setItem('simulatedPlayers', JSON.stringify(allPlayers));
        
        // Si es el usuario actualmente logueado, actualizar su sesión
        const currentUser = getCurrentUser();
        if (currentUser && currentUser.id === userId) {
            // Asegurar que solo se actualicen los campos pasados, manteniendo puntos/porcentaje
            setCurrentUser({...currentUser, ...updateData});
        }

        return true;
    }
    return false;
}

/**
 * Simula la finalización de un partido y el registro del resultado real.
 */
async function finalizeMatchFromAdmin(matchId) {
    const localScore = parseInt(document.getElementById(`admin-local-score-${matchId}`).value);
    const visitorScore = parseInt(document.getElementById(`admin-visitor-score-${matchId}`).value);
    const scorer = document.getElementById(`admin-scorer-${matchId}`).value.trim();
    const time = document.getElementById(`admin-time-${matchId}`).value;
    const minute = parseInt(document.getElementById(`admin-minute-${matchId}`).value);

    if (isNaN(localScore) || isNaN(visitorScore) || !scorer || !time || isNaN(minute)) {
        alert("🚨 Por favor, complete todos los campos de resultado real para finalizar el partido.");
        return;
    }
    
    const minutes = parseInt(minute);
    if(minutes < 1 || minutes > 90) {
        alert("El minuto del gol real debe estar entre 1 y 90.");
        return;
    }
    
    // Obtener los datos actuales (simulados)
    let matches = JSON.parse(JSON.stringify(globalMatches));
    const matchIndex = matches.findIndex(m => m.id === matchId);

    if (matchIndex === -1) {
        alert('Partido no encontrado.');
        return;
    }
    
    const team1Name = matches[matchIndex].equipo_local;
    const team2Name = matches[matchIndex].equipo_visitante;

    // 1. Actualizar el objeto del partido
    matches[matchIndex].estado = "Finalizado";
    matches[matchIndex].resultado_real = `${localScore}-${visitorScore}`;
    matches[matchIndex].ganador_real = determineWinner(localScore, visitorScore, team1Name, team2Name);
    matches[matchIndex].goleador_real = scorer;
    matches[matchIndex].tiempo_gol_real = time;
    matches[matchIndex].minuto_gol_real = minutes;
    matches[matchIndex].isLive = false; // Asegurar que no esté en vivo

    // 2. SIMULAR persistencia de datos 
    simulateMatchDataUpdate(matches); 
    
    // 3. Forzar Recalculo de Puntos y Ranking
    const allPlayers = await fetchData('dummy-players.json');
    await recalculateRanking(allPlayers, getPredictions(), matches);

    alert(`✅ Partido ${matchId}: ${team1Name} vs ${team2Name} finalizado y ranking recalculado.`);
    navigate(APP_ROUTES.ADMIN); // Recargar panel
}

/**
 * Simula el agregado de saldo a un usuario seleccionado.
 */
async function addBalanceToSelectedUser() {
    const select = document.getElementById('admin-user-select');
    const amountInput = document.getElementById('admin-balance-amount');
    const userId = select.value;
    const amount = parseInt(amountInput.value);
    
    if (!userId || isNaN(amount) || amount <= 0) {
        alert("🚨 Ingrese un monto válido y seleccione un usuario.");
        return;
    }

    let allPlayers = await fetchData('dummy-players.json');
    const player = allPlayers.find(p => p.id === userId);

    if (player) {
        const newBalance = (player.balance || 0) + amount;
        
        await simulateUserDataUpdate(userId, { balance: newBalance });
        
        alert(`✅ Se han agregado $${amount}.00 USD a ${player.name}. Nuevo saldo: $${newBalance.toFixed(2)} USD.`);
        navigate(APP_ROUTES.ADMIN); 
    }
}


/**
 * Renderiza la interfaz de gestión de partidos.
 */
function renderMatchManagement(matches) {
    const matchItems = matches.map(match => {
        const isFinished = match.estado === 'Finalizado';
        const winnerText = isFinished ? `Resultado: **${match.resultado_real}** (Ganador: ${match.ganador_real})` : 'Pendiente/Activo';
        
        // Obtener valores reales si existen para precargar el formulario
        const [realLocalScore, realVisitorScore] = match.resultado_real ? match.resultado_real.split('-').map(s => s.trim()) : ['', ''];

        return `
            <div class="card match-admin-item">
                <h4>Partido ${match.id}: ${match.equipo_local} vs ${match.equipo_visitante}</h4>
                <p class="match-details">${match.fecha} / ${match.hora} - Estado: <b>${match.estado}</b>. ${winnerText}</p>
                
                ${!isFinished ? `
                    <div class="form-group admin-match-form">
                        <label>Resultado Local (Goles):</label>
                        <input type="number" id="admin-local-score-${match.id}" min="0" value="${realLocalScore}" placeholder="${match.equipo_local}" required>
                        <span>-</span>
                        <label>Resultado Visitante (Goles):</label>
                        <input type="number" id="admin-visitor-score-${match.id}" min="0" value="${realVisitorScore}" placeholder="${match.equipo_visitante}" required>
                        
                        <label>Goleador (Primer Gol):</label>
                        <input type="text" id="admin-scorer-${match.id}" value="${match.goleador_real || ''}" placeholder="Ej: Lewandoski" required>
                        
                        <label>Tiempo:</label>
                        <select id="admin-time-${match.id}" required>
                            <option value="" ${!match.tiempo_gol_real ? 'selected' : ''}>Sel.</option>
                            <option value="1er" ${match.tiempo_gol_real === '1er' ? 'selected' : ''}>1er T.</option>
                            <option value="2do" ${match.tiempo_gol_real === '2do' ? 'selected' : ''}>2do T.</option>
                        </select>
                        
                        <label>Minuto:</label>
                        <input type="number" id="admin-minute-${match.id}" min="1" max="90" value="${match.minuto_gol_real || ''}" placeholder="Min" required>
                    </div>
                    <button onclick="finalizeMatchFromAdmin(${match.id})" class="btn-primary" style="background-color: var(--color-accent);">FINALIZAR JUEGO</button>
                ` : `<button class="btn-secondary" disabled>Juego Finalizado</button>`}
            </div>
        `;
    }).join('');

    return `
        <div class="admin-section">
            <h3>Gestión de Partidos <i class="fas fa-futbol"></i></h3>
            <p>Define el resultado real para finalizar un juego y activar la puntuación.</p>
            <div class="match-admin-grid">
                ${matchItems}
            </div>
        </div>
    `;
}

/**
 * Renderiza la interfaz de gestión de usuarios y saldos.
 */
async function renderUserManagement() {
    const allPlayers = await fetchData('dummy-players.json');
    
    const userOptions = allPlayers.map(p => 
        `<option value="${p.id}">${p.name} (Saldo: $${p.balance.toFixed(2)})</option>`
    ).join('');
    
    return `
        <div class="admin-section">
            <h3>Gestión de Usuarios y Saldos <i class="fas fa-money-check-alt"></i></h3>
            <div class="card">
                <h4>Agregar Saldo</h4>
                <div class="form-group">
                    <label for="admin-user-select">Seleccionar Usuario:</label>
                    <select id="admin-user-select">
                        <option value="">-- Seleccionar --</option>
                        ${userOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label for="admin-balance-amount">Monto a Agregar (USD):</label>
                    <input type="number" id="admin-balance-amount" min="1" placeholder="Ej: 100" required>
                </div>
                <button onclick="addBalanceToSelectedUser()" class="btn-primary">AÑADIR SALDO</button>
            </div>
            
            <div class="card" style="margin-top: 20px;">
                <h4>Estadísticas Rápidas</h4>
                <p>Total de Jugadores (Simulados): <b>${allPlayers.length}</b></p>
                <p>Participantes Pagados: <b>${allPlayers.filter(p => p.isPaidPrediction).length}</b></p>
            </div>
        </div>
    `;
}


/**
 * Función principal para renderizar el panel administrativo.
 */
async function renderAdminPanel(content) {
    const matches = await fetchData('matches.json');
    
    content.innerHTML = `
        <h2><i class="fas fa-lock"></i> Panel Administrativo (ADMIN)</h2>
        <p>Esta es la interfaz de gestión para simular la actualización de resultados y el manejo de usuarios.</p>
        
        <div class="admin-grid">
            <div class="management-column">
                ${await renderUserManagement()}
            </div>
            <div class="management-column">
                ${renderMatchManagement(matches)}
            </div>
        </div>
        
        <div class="card" style="margin-top: 30px; text-align: center; border-left: 5px solid var(--color-accent);">
            <p>⚠️ **NOTA IMPORTANTE:** Esta interfaz solo simula la gestión de datos mediante JavaScript local. Para una aplicación real, se requeriría un servidor y una base de datos.</p>
            <button onclick="navigate('${APP_ROUTES.DASHBOARD}')" class="btn-secondary" style="margin-top: 15px;"><i class="fas fa-arrow-left"></i> Volver al Dashboard</button>
        </div>
    `;
}

// --- 6. INICIALIZACIÓN ---

function initApp() {
    const user = getCurrentUser();
    // Leer el hash de la URL para determinar la ruta
    const initialRoute = window.location.hash.substring(1) || APP_ROUTES.HOME;

    // Si el usuario está logueado, ir al dashboard (o ruta del hash si es admin)
    if (user) {
        if (initialRoute === APP_ROUTES.ADMIN) {
            navigate(APP_ROUTES.ADMIN);
        } else {
            navigate(APP_ROUTES.DASHBOARD);
        }
    } else {
        // Si no está logueado, solo puede ir a HOME o LOGIN
        if (initialRoute === APP_ROUTES.HOME || initialRoute === APP_ROUTES.LOGIN) {
            navigate(initialRoute);
        } else {
            navigate(APP_ROUTES.HOME);
        }
    }
}

window.onload = initApp;

// Habilitar las funciones globales para que los botones HTML funcionen
window.navigate = navigate;
window.login = login;
window.logout = logout;
window.savePrediction = savePrediction;
window.finalizeMatchFromAdmin = finalizeMatchFromAdmin;
window.addBalanceToSelectedUser = addBalanceToSelectedUser;