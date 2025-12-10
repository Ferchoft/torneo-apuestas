/**
 * =================================================================
 * ARCHIVO: app.js
 * Lógica Central del Prototipo (Completo, Funcional y Responsivo)
 * FINALIZADO: Menú Desplegable (SELECT) para Goleador + Minuto por Gol.
 * =================================================================
 */

// --- 1. CONFIGURACIÓN, PUNTUACIÓN Y DATOS DE MUESTRA ---

const APP_ROUTES = {
    HOME: 'home',
    LOGIN: 'login',
    DASHBOARD: 'dashboard',
    ROOM: 'room',
    PREDICTIONS: 'predictions',
    RANKING: 'ranking'
};

const POINTS_SYSTEM = {
    WINNER: 10,           
    EXACT_SCORE: 20,      
    GOALSCORER_PER_GOAL: 5,   
    GOAL_TIME_PER_GOAL: 5,    
    GOAL_MINUTE_PER_GOAL: 5   
};

const ENTRY_FEE = 5; 
const ROOM_LIMIT = 1000;
let currentInterval; 
let carouselInterval; 

const SAMPLE_USERS = [
    { id: 'usr-demo-01', name: 'Presentador Pro', balance: 500, puntos: 60, porcentaje: 80, isPaidPrediction: true },
    { id: 'usr-demo-02', name: 'Jugador Beta', balance: 250, puntos: 35, porcentaje: 50, isPaidPrediction: true }, 
    { id: 'usr-demo-03', name: 'Invitado Master', balance: 100, puntos: 10, porcentaje: 20, isPaidPrediction: false }
];

// Variables globales para el manejo de datos dinámicos
let globalMatches = []; 
let teamPlayersData = {};

// --- 2. MANEJO DE DATOS Y ESTADO (localStorage y Fetch) ---

function getCurrentUser() {
    const user = localStorage.getItem('currentUser');
    return user ? JSON.parse(user) : null;
}

function setCurrentUser(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
}

function getPredictions() {
    const preds = localStorage.getItem('predictions');
    return preds ? JSON.parse(preds) : {};
}

function savePredictions(predictions) {
    localStorage.setItem('predictions', JSON.stringify(predictions));
}

async function fetchData(filename) {
    // Función central para cargar datos de JSON
    if (filename === 'matches.json') {
        try {
            const response = await fetch('./data/matches.json'); 
            return await response.json();
        } catch (error) {
            console.error("Error al cargar matches.json. Asegúrate de que está en la carpeta /data.", error);
            return [];
        }
    }
    if (filename === 'dummy-players.json') {
        try {
            const response = await fetch('./data/dummy-players.json');
            const dummyPlayers = await response.json();
            const updatedDummies = dummyPlayers.map(p => ({
                ...p,
                isPaidPrediction: p.isPaidPrediction !== undefined ? p.isPaidPrediction : (Math.random() > 0.5) 
            }));
            
            const filteredDummies = updatedDummies.filter(dp => !SAMPLE_USERS.some(su => su.id === dp.id));
            return [...SAMPLE_USERS, ...filteredDummies];
        } catch (error) {
            console.error("Error al cargar dummy-players.json. Asegúrate de que está en la carpeta /data.", error);
            return SAMPLE_USERS; 
        }
    }
    return [];
}

/**
 * Nueva función para cargar la lista de jugadores por equipo.
 */
async function fetchTeamPlayers() {
    if (Object.keys(teamPlayersData).length > 0) return teamPlayersData;
    try {
        const response = await fetch('./data/team-players.json'); 
        teamPlayersData = await response.json();
        return teamPlayersData;
    } catch (error) {
        console.error("Error al cargar team-players.json. Asegúrate de crear este archivo en la carpeta /data.", error);
        return {};
    }
}


// --- 3. FUNCIONES DE PUNTUACIÓN Y CÁLCULO ---

function determineWinner(score1, score2, team1Name, team2Name) {
    if (score1 > score2) return team1Name;
    if (score2 > score1) return team2Name;
    return 'Empate';
}

/**
 * Calcula los puntos obtenidos en un partido (Ajustado para minuto por gol).
 */
function calculatePoints(prediction, match) {
    if (match.estado !== 'Finalizado' || !prediction) return { points: 0, totalPossiblePoints: 0 }; 

    let points = 0;
    
    // Calcular puntos posibles basado en el marcador predicho por el usuario
    const totalGoalsPredicted = (prediction.localScore || 0) + (prediction.visitorScore || 0);
    // 15 Puntos por cada gol predicho (Goleador + Tiempo + Minuto)
    const maxGoalPoints = totalGoalsPredicted * (POINTS_SYSTEM.GOALSCORER_PER_GOAL + POINTS_SYSTEM.GOAL_TIME_PER_GOAL + POINTS_SYSTEM.GOAL_MINUTE_PER_GOAL);
    
    const totalPossiblePoints = POINTS_SYSTEM.WINNER + POINTS_SYSTEM.EXACT_SCORE + maxGoalPoints; 
    
    // 1. Acierto en el Ganador/Empate (10 pts)
    const userWinner = determineWinner(
        prediction.localScore,
        prediction.visitorScore,
        match.equipo_local,
        match.equipo_visitante
    );
    if (userWinner === match.ganador_real) {
        points += POINTS_SYSTEM.WINNER;
    }

    // 2. Acierto en el Marcador Exacto (20 pts)
    const userScore = `${prediction.localScore}-${prediction.visitorScore}`;
    if (userScore === match.resultado_real) {
        points += POINTS_SYSTEM.EXACT_SCORE;
    }
    
    // 3. Puntuación por Goleadores, Tiempos y Minutos (Solo primer gol real)
    // Se asume que el dato de goleador_real en matches.json es el del PRIMER gol.
    if (match.ganador_real !== 'Empate') {
        const isLocalWinner = match.ganador_real === match.equipo_local;
        
        // Arrays de predicción del equipo GANADOR (solo el primer elemento de los arrays)
        const winnerScorers = isLocalWinner ? prediction.scorerLocal : prediction.scorerVisitor;
        const winnerTimes = isLocalWinner ? prediction.goalTimeLocal : prediction.goalTimeVisitor;
        const winnerMinutes = isLocalWinner ? prediction.goalMinuteLocal : prediction.goalMinuteVisitor;

        // Acierto de Goleador del Primer Gol del Ganador
        if (winnerScorers && winnerScorers[0] && winnerScorers[0].toLowerCase() === match.goleador_real.toLowerCase()) {
            points += POINTS_SYSTEM.GOALSCORER_PER_GOAL;
        }

        // Acierto de Tiempo del Primer Gol del Ganador
        if (winnerTimes && winnerTimes[0] && winnerTimes[0] === match.tiempo_gol_real) {
            points += POINTS_SYSTEM.GOAL_TIME_PER_GOAL;
        }

        // Acierto de Minuto Aproximado del Primer Gol del Ganador
        const minuteDiff = Math.abs(parseInt(winnerMinutes ? winnerMinutes[0] : 0) - match.minuto_gol_real);
        if (minuteDiff <= 5 && winnerMinutes && winnerMinutes[0]) {
            points += POINTS_SYSTEM.GOAL_MINUTE_PER_GOAL;
        }
    }
    
    return {
        points: points,
        totalPossiblePoints: totalPossiblePoints
    };
}


async function recalculateRanking(allPlayers, allPredictions, matches) {
    const ranking = allPlayers.map(player => {
        let totalPoints = 0;
        let totalPossiblePoints = 0;

        if (player.isPaidPrediction) { 
            matches.forEach(match => {
                const predKey = `${player.id}-${match.id}`;
                const prediction = allPredictions[predKey];

                const result = calculatePoints(prediction, match);
                totalPoints += result.points;
                if(match.estado === 'Finalizado' || prediction) {
                    totalPossiblePoints += result.totalPossiblePoints;
                }
            });
        }

        player.puntos = totalPoints;
        const percentage = totalPossiblePoints > 0 ? Math.round((totalPoints / totalPossiblePoints) * 100) : 0;
        player.porcentaje = percentage;

        return {
            ...player,
            puntos: totalPoints,
            porcentaje: percentage,
        };
    });

    const paidRanking = ranking.filter(p => p.isPaidPrediction).sort((a, b) => {
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        if (b.porcentaje !== a.porcentaje) return b.porcentaje - a.porcentaje;
        return a.name.localeCompare(b.name);
    });

    paidRanking.forEach((player, index) => {
        player.posicion = index + 1;
    });

    const currentUser = getCurrentUser();
    if (currentUser) {
        const updatedUser = paidRanking.find(p => p.id === currentUser.id);
        if (updatedUser) {
            const finalUser = {
                ...updatedUser,
                balance: currentUser.balance,
                isPaidPrediction: currentUser.isPaidPrediction
            };
            setCurrentUser(finalUser);
        }
    }

    return paidRanking;
}


// --- 4. FUNCIONES DE VISTA (RENDERING) ---

function navigate(route, data = {}) {
    const content = document.getElementById('app-content');
    
    if (currentInterval) {
        clearInterval(currentInterval);
        currentInterval = null;
    }
    if (carouselInterval) {
        clearInterval(carouselInterval);
        carouselInterval = null;
    }

    renderHeader(getCurrentUser());

    switch (route) {
        case APP_ROUTES.HOME:
            content.innerHTML = renderHome();
            break;
        case APP_ROUTES.LOGIN:
            content.innerHTML = renderLogin();
            handleLogin(); 
            break;
        case APP_ROUTES.DASHBOARD:
            renderDashboard(content);
            break;
        case APP_ROUTES.ROOM:
            renderRoom(content, data.roomId || 'Sala_1');
            break;
        case APP_ROUTES.PREDICTIONS:
            renderPredictions(content);
            break;
        case APP_ROUTES.RANKING:
            renderRanking(content);
            break;
        default:
            content.innerHTML = `<h2>Ruta no encontrada</h2><button onclick="navigate('${APP_ROUTES.HOME}')" class="btn-primary">Inicio</button>`;
    }
}

function renderHeader(user) {
    const header = document.getElementById('app-header');
    if (!header) return;

    const balance = user ? user.balance.toFixed(2) : 0.00;

    if (user) {
        header.innerHTML = `
            <h1><i class="fas fa-futbol"></i> **FOOTBALL POOL MAX**</h1>
            <div class="nav-links">
                <span class="welcome-msg">¡Hola, <b>${user.name}</b>!</span>
                <span class="balance">Saldo: $${balance}</span>
                <button onclick="navigate('${APP_ROUTES.DASHBOARD}')" title="Dashboard"><i class="fas fa-home"></i> Dashboard</button>
                <button onclick="logout()" title="Cerrar Sesión"><i class="fas fa-sign-out-alt"></i> Salir</button>
            </div>
        `;
    } else {
        header.innerHTML = `
            <h1><i class="fas fa-futbol"></i> **FOOTBALL POOL MAX**</h1>
            <div class="nav-links">
                <button onclick="navigate('${APP_ROUTES.LOGIN}')" class="btn-secondary">Iniciar / Registrar</button>
            </div>
        `;
    }
}

function startCarouselAutoScroll() {
    if (carouselInterval) {
        clearInterval(carouselInterval);
    }
    
    const carousel = document.querySelector('.carousel');
    if (!carousel) return;

    const scrollStep = 315; 
    let isAtEnd = false;

    carouselInterval = setInterval(() => {
        if (!carousel) {
            clearInterval(carouselInterval);
            return;
        }

        if (isAtEnd) {
            carousel.scrollLeft = 0;
            isAtEnd = false;
        } else {
            carousel.scrollLeft += scrollStep;

            if (carousel.scrollLeft + carousel.clientWidth >= carousel.scrollWidth) {
                isAtEnd = true;
            }
        }
    }, 2000); 
}

function scrollCarousel(direction) {
    const carousel = document.querySelector('.carousel');
    if (!carousel) return;

    if (carouselInterval) {
        clearInterval(carouselInterval);
        carouselInterval = null;
    }

    const scrollStep = 315; 
    let scrollAmount = direction === 'left' ? -scrollStep : scrollStep;
    
    carousel.scrollBy({
        left: scrollAmount,
        behavior: 'smooth'
    });

    setTimeout(startCarouselAutoScroll, 5000); 
}


function renderCarousel() {
    const items = [
        { title: "Bote Millonario", subtitle: "Sala Global #1", detail: `Entrada $${ENTRY_FEE}.00`, jackpot: "$12,500 USD", route: APP_ROUTES.ROOM },
        { title: "Próximo Partido Clave", subtitle: "Man. Utd vs Liverpool", detail: "Cierra en 2 horas", jackpot: "Predice Ahora", route: APP_ROUTES.PREDICTIONS },
        { title: "Tu Posición Actual", subtitle: "Ver Ranking", detail: "Puntos Acumulados", jackpot: "Posición #12", route: APP_ROUTES.RANKING },
        { title: "Nueva Sala Rápida", subtitle: "Entrada $10 USD", detail: "Solo 5 Partidos", jackpot: "¡Únete Ya!", route: APP_ROUTES.ROOM },
    ];

    const carouselItemsHTML = items.map(item => `
        <div class="carousel-item">
            <h4>${item.title}</h4>
            <p>${item.subtitle}</p>
            <div class="bet-info">${item.detail}: <span>${item.jackpot}</span></div>
            <button class="btn-secondary" onclick="navigate('${item.route}')">Ver Detalles</button>
        </div>
    `).join('');

    return `
        <div class="carousel-container">
            <button class="carousel-nav-btn left" onclick="scrollCarousel('left')">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="carousel">
                ${carouselItemsHTML}
            </div>
            <button class="carousel-nav-btn right" onclick="scrollCarousel('right')">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;
}

function renderHome() {
    const htmlContent = `
        ${renderCarousel()}
        <div class="card" style="text-align: center; border-left: none;">
            <h2>Bienvenido a **Football Pool Max** 🚀</h2>
            <p>La **Quiniela Híbrida** donde la precisión te lleva a la cima del bote.</p>
            <p>¡Solo **$${ENTRY_FEE}.00 USD** por entrada! Haz tus predicciones y sube en el ranking.</p>
            <button onclick="navigate('${APP_ROUTES.LOGIN}')" class="btn-primary" style="margin-top: 20px; font-size: 1.2em;">
                <i class="fas fa-bolt"></i> **COMENZAR A JUGAR**
            </button>
        </div>
    `;

    setTimeout(startCarouselAutoScroll, 10); 
    
    return htmlContent;
}

function renderLogin() {
    return `
        <div class="card" style="max-width: 450px; margin: 40px auto; text-align: center;">
            <h2>Acceso a la Plataforma <i class="fas fa-lock"></i></h2>
            <p>Usa uno de los nombres de prueba para simular la presentación:</p>
            <ul>
                ${SAMPLE_USERS.map(u => `<li>**${u.name}**</li>`).join('')}
            </ul>
            <form id="login-form" style="margin-top: 20px;">
                <div class="form-group">
                    <label for="username">Nombre de Usuario:</label>
                    <input type="text" id="username" required placeholder="Ingresa tu nombre" autofocus>
                </div>
                <button type="submit" class="btn-primary" style="width: 100%;"><i class="fas fa-sign-in-alt"></i> **ACCEDER**</button>
            </form>
        </div>
    `;
}

async function renderDashboard(content) {
    const user = getCurrentUser();
    if (!user) {
        navigate(APP_ROUTES.LOGIN);
        return;
    }

    const matches = await fetchData('matches.json');
    const allPlayers = await fetchData('dummy-players.json');
    const ranking = await recalculateRanking(allPlayers, getPredictions(), matches);
    const userPosition = ranking.find(p => p.id === user.id)?.posicion || 'N/A';
    
    const predictionStatus = user.isPaidPrediction 
        ? `<p style="color: var(--color-secondary);">✅ **Entrada Pagada.** Puedes editar tus predicciones.</p>`
        : `<p style="color: var(--color-accent);">⚠️ **Entrada Pendiente.** Paga $${ENTRY_FEE}.00 para empezar a competir.</p>`;

    content.innerHTML = `
        ${renderCarousel()}
        <h2><i class="fas fa-tachometer-alt"></i> Panel de Control de Apuestas</h2>
        <div class="card" style="text-align: center; border-left: 5px solid ${user.puntos > 0 ? 'var(--color-secondary)' : 'var(--color-accent)'};">
            <h3>¡Bienvenido de nuevo, **${user.name}**!</h3>
            ${predictionStatus}
            <p>Tu posición actual en la Sala Global #1 es: **#${userPosition}**</p>
            <p>Puntos acumulados: **${user.puntos}** | Porcentaje de acierto: **${user.porcentaje}%**</p>
        </div>

        <div class="action-grid">
            <div class="action-card">
                <i class="fas fa-money-check-alt"></i>
                <h3>Entrar al Bote / Sala</h3>
                <p>Costo: $${ENTRY_FEE}.00 USD</p>
                <button onclick="navigate('${APP_ROUTES.ROOM}')" class="btn-primary">
                    <i class="fas fa-door-open"></i> **IR A LA SALA**
                </button>
            </div>
            <div class="action-card">
                <i class="fas fa-edit"></i>
                <h3>Hacer/Editar Predicciones</h3>
                <p>5 Partidos disponibles.</p>
                <button onclick="navigate('${APP_ROUTES.PREDICTIONS}')" class="btn-primary">
                    <i class="fas fa-futbol"></i> **PREDECIR**
                </button>
            </div>
            <div class="action-card">
                <i class="fas fa-list-ol"></i>
                <h3>Ver Ranking en Vivo</h3>
                <p>Compara tu desempeño.</p>
                <button onclick="navigate('${APP_ROUTES.RANKING}')" class="btn-primary">
                    <i class="fas fa-trophy"></i> **RANKING**
                </button>
            </div>
        </div>
    `;
    
    setTimeout(startCarouselAutoScroll, 10);
}

function renderRankingTable(ranking) {
    const user = getCurrentUser();
    
    const paidPlayers = ranking.length;
    const currentJackpot = paidPlayers * ENTRY_FEE;
    const topScore = ranking[0]?.puntos || 0;
    const topScorers = ranking.filter(p => p.puntos === topScore);
    
    let winnerMessage = '';
    if (paidPlayers > 0 && topScore > 0) {
        if (topScorers.length === 1) {
            winnerMessage = `¡El ganador actual del bote ($${currentJackpot.toFixed(2)} USD) es **${topScorers[0].name}** con ${topScorers[0].puntos} puntos!`;
        } else {
            const share = currentJackpot / topScorers.length;
            winnerMessage = `¡Hay ${topScorers.length} ganadores empatados! El bote de $${currentJackpot.toFixed(2)} USD se repartirá ($${share.toFixed(2)} USD cada uno).`;
        }
    } else if (paidPlayers > 0) {
         winnerMessage = `El bote actual es de $${currentJackpot.toFixed(2)} USD. ¡Nadie ha sumado puntos aún!`;
    }


    const tableRows = ranking.map(player => {
        return `
            <tr class="${player.id === user.id ? 'current-user' : ''}">
                <td data-label="Posición"><i class="fas fa-star"></i> ${player.posicion}</td>
                <td data-label="Jugador">${player.name}</td>
                <td data-label="Puntos">${player.puntos}</td>
                <td data-label="% Aciertos">${player.porcentaje}%</td>
            </tr>
        `;
    }).join('');

    return `
        <div class="card" style="margin-bottom: 20px; border-left: 5px solid var(--color-accent); text-align: center;">
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
        const dummyPlayers = playersForSim.filter(p => !p.id.startsWith('usr-demo') && p.isPaidPrediction);
        if (dummyPlayers.length > 0) {
            const randomIndex = Math.floor(Math.random() * dummyPlayers.length);
            const dummyPlayer = dummyPlayers[randomIndex];
            if (Math.random() < 0.2) { 
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

async function renderRoom(content, roomId) {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.LOGIN);

    const matches = await fetchData('matches.json');
    const allPlayers = await fetchData('dummy-players.json');
    
    const paidPlayers = allPlayers.filter(p => p.isPaidPrediction).length;
    const currentJackpot = paidPlayers * ENTRY_FEE;
    
    content.innerHTML = `
        <h2><i class="fas fa-users"></i> Sala: ${roomId}</h2>
        <div class="card">
            <h3>Detalles de la Sala</h3>
            <p>Participantes Pagados: <b id="player-count">${paidPlayers}</b> / ${ROOM_LIMIT}</p>
            <p>Bote Actual: <b>$${currentJackpot.toFixed(2)} USD</b></p>
            <button onclick="navigate('${APP_ROUTES.PREDICTIONS}')" class="btn-primary"><i class="fas fa-edit"></i> Mis Predicciones</button>
        </div>
        <div class="card" id="room-ranking-container">
            <h3>Ranking en Tiempo Real (Solo Participantes Pagados)</h3>
        </div>
    `;

    startRankingSimulation(allPlayers, matches);
}

/**
 * Nueva función para manejar la selección de 'Otro' goleador y mostrar input.
 */
function handleScorerSelect(selectElement, matchId, teamKey, goalIndex) {
    const container = document.getElementById(`custom-scorer-container-${teamKey}-${matchId}-${goalIndex}`);
    const teamName = teamKey === 'Local' ? globalMatches.find(m => m.id === matchId).equipo_local : globalMatches.find(m => m.id === matchId).equipo_visitante;
    
    if (selectElement.value === 'Otro') {
        container.innerHTML = `<input type="text" id="customScorer${teamKey}-${matchId}-${goalIndex}" class="custom-scorer-input" value="" placeholder="Especifique el Goleador de ${teamName}" required />`;
    } else {
        container.innerHTML = '';
    }
}

// =================================================================
// FUNCIÓN CLAVE: Genera campos de entrada dinámicos (Goleador, Tiempo, Minuto)
// =================================================================
function renderGoalInputs(match, team, totalGoals, currentPred) {
    let html = '';
    const teamKey = team === 'local' ? 'Local' : 'Visitor';
    const teamName = team === 'local' ? match.equipo_local : match.equipo_visitante;
    const matchId = match.id;

    const scorerArray = currentPred[`scorer${teamKey}`] || [];
    const timeArray = currentPred[`goalTime${teamKey}`] || [];
    const minuteArray = currentPred[`goalMinute${teamKey}`] || []; 
    
    const players = teamPlayersData[teamName] || []; // Obtener la lista de jugadores

    for (let i = 0; i < totalGoals; i++) {
        const currentScorer = scorerArray[i] || '';
        const currentTime = timeArray[i] || '';
        const currentMinute = minuteArray[i] || ''; 

        // 1. Opciones del Select de Goleador
        const scorerOptions = players.map(player => 
            `<option value="${player}" ${currentScorer === player ? 'selected' : ''}>${player}</option>`
        ).join('');
        
        // Determinar si la predicción guardada es un nombre personalizado ('Otro')
        let isCustomScorer = currentScorer && !players.includes(currentScorer);
        let customInputHtml = '';

        if (isCustomScorer) {
             customInputHtml = `<input type="text" id="customScorer${teamKey}-${matchId}-${i}" class="custom-scorer-input" value="${currentScorer}" placeholder="Especifique el Goleador de ${teamName}" required />`;
        }

        // 2. HTML del Select de Goleador y Contenedor para Input Personalizado
        const scorerSelectHtml = `
            <select id="scorer${teamKey}-${matchId}-${i}" class="scorer-select" 
                    onchange="handleScorerSelect(this, ${matchId}, '${teamKey}', ${i})">
                <option value="" ${!currentScorer && !isCustomScorer ? 'selected' : ''}>Seleccionar Goleador</option>
                ${scorerOptions}
                <option value="Otro" ${isCustomScorer ? 'selected' : ''}>Otro (Especifique)</option>
            </select>
            <div id="custom-scorer-container-${teamKey}-${matchId}-${i}" class="custom-scorer-container">
                ${customInputHtml}
            </div>
        `;


        html += `
            <div class="goal-input-group">
                <label for="scorer${teamKey}-${matchId}-${i}">Gol ${i + 1} - Goleador:</label>
                <div class="scorer-input-wrapper">
                    ${scorerSelectHtml}
                </div>

                <label for="goalTime${teamKey}-${matchId}-${i}">Tiempo:</label>
                <select id="goalTime${teamKey}-${matchId}-${i}" class="time-input" required>
                    <option value="" ${!currentTime ? 'selected' : ''}>Sel.</option>
                    <option value="1er" ${currentTime === '1er' ? 'selected' : ''}>1er T.</option>
                    <option value="2do" ${currentTime === '2do' ? 'selected' : ''}>2do T.</option>
                </select>

                <label for="goalMinute${teamKey}-${matchId}-${i}">Minuto:</label>
                <input type="number" id="goalMinute${teamKey}-${matchId}-${i}" class="minute-input" 
                       min="1" max="90" value="${currentMinute}" placeholder="1-90" required>
            </div>
        `;
    }
    return html;
}

// =================================================================
// FUNCIÓN CLAVE: Maneja el cambio de marcador para actualizar la interfaz
// =================================================================
function handleScoreChange(matchId, team) {
    const scoreInput = document.getElementById(`${team}Score-${matchId}`);
    const inputsContainer = document.getElementById(`${team}-goals-container-${matchId}`);
    
    let totalGoals = parseInt(scoreInput.value) || 0;
    
    if (totalGoals < 0) {
        totalGoals = 0;
        scoreInput.value = 0;
    }

    const user = getCurrentUser();
    const userPredictions = getPredictions();
    const predKey = `${user.id}-${matchId}`;
    const currentPred = userPredictions[predKey] || {};
    
    const match = globalMatches.find(m => m.id === matchId);

    inputsContainer.innerHTML = renderGoalInputs(match, team, totalGoals, currentPred);
}

async function renderPredictions(content) {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.LOGIN);

    const matches = await fetchData('matches.json');
    globalMatches = matches; // Almacenar partidos globalmente
    await fetchTeamPlayers(); // Cargar la lista de jugadores

    const userPredictions = getPredictions();
    const isPaid = user.isPaidPrediction;

    const paymentWarning = isPaid 
        ? `<p style="color: var(--color-secondary); font-weight: bold;"><i class="fas fa-check-circle"></i> Entrada Pagada. Edita y guarda tus pronósticos.</p>`
        : `<div class="card" style="border-left: 5px solid var(--color-accent); text-align: center;">
            <p>🚨 **DEBES PAGAR LA ENTRADA** 🚨</p>
            <p>Para que tus predicciones cuenten y compitas en el ranking, debes pagar la entrada de **$${ENTRY_FEE}.00 USD**.</p>
            <button onclick="payEntryFee()" class="btn-primary"><i class="fas fa-dollar-sign"></i> PAGAR $${ENTRY_FEE}.00 USD Y EMPEZAR A COMPETIR</button>
        </div>`;


    const formHTML = matches.map(match => {
        const predKey = `${user.id}-${match.id}`;
        const currentPred = userPredictions[predKey] || {};
        const isFinished = match.estado === 'Finalizado';
        
        const disabledAttr = !isPaid || isFinished ? 'disabled' : '';
        
        const pointsObtained = isFinished && currentPred.localScore !== undefined ? calculatePoints(currentPred, match).points : 0;
        const resultText = isFinished 
            ? `<p style="color: var(--color-secondary); font-weight: bold;">Resultado Final: ${match.resultado_real} (${match.ganador_real}) - Puntos obtenidos: ${pointsObtained}</p>` 
            : '';
        
        const localScore = currentPred.localScore !== undefined ? currentPred.localScore : '';
        const visitorScore = currentPred.visitorScore !== undefined ? currentPred.visitorScore : '';

        return `
            <div class="match-prediction card" data-match-id="${match.id}">
                <h3>Partido ${match.id}: ${match.equipo_local} vs ${match.equipo_visitante}</h3>
                <p>Fecha: ${match.fecha}, Hora: ${match.hora}. Estado: <b>${match.estado}</b></p>
                ${resultText}
                
                <div class="flex-row score-row">
                    <div>
                        <label>Marcador Exacto (Goles):</label>
                        <div class="team-score-input">
                            <label for="localScore-${match.id}">${match.equipo_local}</label>
                            <input type="number" id="localScore-${match.id}" min="0" value="${localScore}" 
                                   oninput="handleScoreChange(${match.id}, 'local')" required ${disabledAttr}>
                            <span> - </span>
                            <input type="number" id="visitorScore-${match.id}" min="0" value="${visitorScore}" 
                                   oninput="handleScoreChange(${match.id}, 'visitor')" required ${disabledAttr}>
                            <label for="visitorScore-${match.id}">${match.equipo_visitante}</label>
                        </div>
                    </div>
                </div>
                
                <div class="flex-row dynamic-prediction-row">
                    <div class="team-block">
                        <h4>Predicción de Goles de **${match.equipo_local}**</h4>
                        <div id="local-goals-container-${match.id}" class="goal-input-grid">
                            ${renderGoalInputs(match, 'local', localScore, currentPred)}
                        </div>
                    </div>

                    <div class="team-block">
                        <h4>Predicción de Goles de **${match.equipo_visitante}**</h4>
                        <div id="visitor-goals-container-${match.id}" class="goal-input-grid">
                            ${renderGoalInputs(match, 'visitor', visitorScore, currentPred)}
                        </div>
                    </div>
                </div>
                
                ${!isFinished && isPaid ? `<button onclick="savePrediction(${match.id})" class="btn-primary" style="margin-top: 15px;"><i class="fas fa-save"></i> Guardar Predicción</button>` : ''}
            </div>
        `;
    }).join('');

    content.innerHTML = `
        <h2><i class="fas fa-futbol"></i> Pantalla de Predicciones</h2>
        <p>Realiza tus predicciones para los 5 partidos. Ingresa el marcador para habilitar los campos detallados de **Goleador, Tiempo (1er/2do) y Minuto Aproximado (1-90) de CADA GOL**. Selecciona el goleador de la lista o elige 'Otro'.</p>
        <button onclick="navigate('${APP_ROUTES.DASHBOARD}')" class="btn-primary" style="margin-bottom: 20px;"><i class="fas fa-arrow-left"></i> Volver al Dashboard</button>
        
        ${paymentWarning}

        <div id="predictions-list">
            ${formHTML}
        </div>
    `;
}

async function renderRanking(content) {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.LOGIN);

    const matches = await fetchData('matches.json');
    const allPlayers = await fetchData('dummy-players.json');
    
    content.innerHTML = `
        <h2><i class="fas fa-trophy"></i> Ranking General</h2>
        <p>Posiciones actualizadas. Solo se muestran los participantes con entrada pagada.</p>
        <button onclick="navigate('${APP_ROUTES.DASHBOARD}')" class="btn-primary" style="margin-bottom: 20px;"><i class="fas fa-arrow-left"></i> Volver al Dashboard</button>
        <div class="card" id="full-ranking-container">
        </div>
    `;

    startRankingSimulation(allPlayers, matches);
}


// --- 5. LÓGICA DE INTERACCIÓN ---

function handleLogin() {
    const form = document.getElementById('login-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        if (!username) return;

        let user = SAMPLE_USERS.find(u => u.name.toLowerCase() === username.toLowerCase());
        let currentLocalUser = getCurrentUser();

        if (user) {
            if (currentLocalUser && currentLocalUser.id === user.id) {
                 user = { ...currentLocalUser, name: user.name, isPaidPrediction: user.isPaidPrediction }; 
            }
        } else if (currentLocalUser && currentLocalUser.name.toLowerCase() === username.toLowerCase()) {
            user = currentLocalUser;
        } else {
            const newId = 'usr-' + Math.random().toString(36).substring(2, 5); 
            user = { id: newId, name: username, balance: 100, puntos: 0, porcentaje: 0, isPaidPrediction: false };
        }

        setCurrentUser(user);
        navigate(APP_ROUTES.DASHBOARD);
    });
}

function payEntryFee() {
    const user = getCurrentUser();
    if (!user) return navigate(APP_ROUTES.LOGIN);

    if (user.balance < ENTRY_FEE) {
        alert(`❌ Saldo insuficiente. Necesitas $${ENTRY_FEE}.00 USD.`);
        return;
    }

    if (confirm(`¿Estás seguro de que quieres pagar la entrada de $${ENTRY_FEE}.00 USD para empezar a competir? Este monto será descontado de tu saldo.`)) {
        user.balance -= ENTRY_FEE;
        user.isPaidPrediction = true;
        setCurrentUser(user);
        alert(`✅ Pago exitoso. Se descontaron $${ENTRY_FEE}.00 USD. ¡Ya puedes hacer tus predicciones y competir!`);
        
        navigate(APP_ROUTES.PREDICTIONS);
    }
}


function logout() {
    localStorage.removeItem('currentUser');
    navigate(APP_ROUTES.HOME);
}

// =================================================================
// FUNCIÓN CLAVE: Guardar las predicciones dinámicas (Goleador, Tiempo, Minuto por gol)
// =================================================================
function savePrediction(matchId) {
    const user = getCurrentUser();
    if (!user || !user.isPaidPrediction) {
        alert("⚠️ Debes pagar la entrada para guardar predicciones.");
        return;
    }

    const localScoreInput = document.getElementById(`localScore-${matchId}`);
    const visitorScoreInput = document.getElementById(`visitorScore-${matchId}`);
    
    // Obtener marcadores
    const localScore = parseInt(localScoreInput.value) || 0;
    const visitorScore = parseInt(visitorScoreInput.value) || 0;

    if (localScoreInput.value === "" || visitorScoreInput.value === "") {
        alert("Por favor, completa el marcador (goles) antes de guardar.");
        return;
    }
    
    // Función auxiliar para leer los campos dinámicos
    const getDynamicInputs = (team) => {
        const teamKey = team === 'local' ? 'Local' : 'Visitor';
        const score = team === 'local' ? localScore : visitorScore;
        
        const scorers = [];
        const times = [];
        const minutes = []; 
        
        for (let i = 0; i < score; i++) {
            const scorerSelect = document.getElementById(`scorer${teamKey}-${matchId}-${i}`);
            const timeSelect = document.getElementById(`goalTime${teamKey}-${matchId}-${i}`);
            const minuteInput = document.getElementById(`goalMinute${teamKey}-${matchId}-${i}`); 
            const customScorerInput = document.getElementById(`customScorer${teamKey}-${matchId}-${i}`);

            let scorerValue = '';

            // Lógica para obtener el valor del goleador (Select o Input custom)
            if (scorerSelect.value === 'Otro' && customScorerInput) {
                scorerValue = customScorerInput.value.trim();
                if (scorerValue === "") {
                    alert(`Por favor, especifique el nombre del goleador para el gol #${i+1} del equipo ${team}.`);
                    return null;
                }
            } else {
                scorerValue = scorerSelect.value;
            }
            
            // Validar que los campos detallados no estén vacíos si el puntaje es > 0
            if (score > 0 && (scorerValue === "" || 
                              !timeSelect || timeSelect.value === "" || 
                              !minuteInput || minuteInput.value === "")) 
            {
                 alert(`Por favor, completa el goleador, el tiempo y el minuto para el gol #${i+1} del equipo ${team}.`);
                 return null; 
            }
            
            // Validación de rango de minuto
            const minuteValue = parseInt(minuteInput.value);
            if(minuteValue < 1 || minuteValue > 90) {
                 alert(`El minuto para el gol #${i+1} del equipo ${team} debe estar entre 1 y 90.`);
                 return null;
            }

            if (scorerValue) scorers.push(scorerValue);
            if (timeSelect) times.push(timeSelect.value);
            if (minuteInput) minutes.push(minuteValue);
        }
        return { scorers, times, minutes };
    };

    const localData = getDynamicInputs('local');
    const visitorData = getDynamicInputs('visitor');
    
    if (localData === null || visitorData === null) {
        return; 
    }


    const newPrediction = {
        localScore: localScore,
        visitorScore: visitorScore,
        
        // Se guardan como ARRAYS (listas)
        scorerLocal: localData.scorers,
        goalTimeLocal: localData.times,
        goalMinuteLocal: localData.minutes, 
        
        scorerVisitor: visitorData.scorers,
        goalTimeVisitor: visitorData.times,
        goalMinuteVisitor: visitorData.minutes, 
    };

    const predKey = `${user.id}-${matchId}`;
    const allPredictions = getPredictions();
    allPredictions[predKey] = newPrediction;
    savePredictions(allPredictions);

    alert(`¡Predicción para el Partido ${matchId} guardada con éxito!`);
    navigate(APP_ROUTES.PREDICTIONS); 
}


// --- 6. INICIALIZACIÓN ---

function initApp() {
    const user = getCurrentUser();
    if (user) {
        navigate(APP_ROUTES.DASHBOARD);
    } else {
        navigate(APP_ROUTES.HOME);
    }
}

window.onload = initApp;

// Habilitar las funciones para el acceso global (botones onclick)
window.navigate = navigate;
window.logout = logout;
window.savePrediction = savePrediction;
window.scrollCarousel = scrollCarousel;
window.payEntryFee = payEntryFee;
window.handleScoreChange = handleScoreChange;
window.handleScorerSelect = handleScorerSelect;