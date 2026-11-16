/**
 * ============================================================================
 * ARQUIVO: domino.engine.js
 * LOCAL: server/games/domino/domino.engine.js
 * ============================================================================
 *
 * DESCRIÇÃO:
 * Engine BASE (crua) do Dominó tradicional, duplo-seis, 2 a 4 jogadores.
 * Existe para validar o contrato com um segundo jogo; regras avançadas ficam para depois.
 *
 * COMANDOS (interpretados só aqui):
 * - 'play-piece' { index, side: 'left' | 'right' }  joga a peça da mão (índice) numa ponta.
 * - 'draw-piece' {}   compra do monte (só se config.allowDraw e sem peça jogável).
 * - 'pass' {}         passa a vez (só sem peça jogável e sem monte para comprar).
 *
 * REGRAS IMPLEMENTADAS:
 * - 28 peças; cada jogador recebe config.piecesPerPlayer; o resto forma o monte.
 * - Sem peça jogável, compra do monte (limitado) até achar; monte vazio = passa (config.allowDraw, padrão ligado).
 * - Começa quem tem a maior dupla (senão a peça de maior soma) e a 1ª jogada é essa peça.
 * - Vence quem bater (mão vazia). Se todos passarem seguidos (jogo travado),
 *   vence quem tiver menos pontos na mão (empate = vários vencedores).
 *
 * PENDENTE (decisões de regra em aberto, não presumidas): pontuação por rodada,
 * carroça/lá-e-ló/cruzada, bater de 4 jogadores em duplas.
 *
 * DATA DE CRIAÇÃO: 08/11/2026 (Etapa 5, base do Dominó).
 *
 * AUTOR: Viana-78
 *
 * ============================================================================
 */

const { ok, fail, transition, ERROR_CODES } = require('@bardotiao/game-contract');
const { normalizeBySchema } = require('@bardotiao/game-contract');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const BOT_NAMES = ['Zé Dominó', 'Dona Peça', 'Seu Duplo', 'Tia Ponta'];

const CONFIG_SCHEMA = {
    piecesPerPlayer: { type: 'integer', min: 5, max: 7, default: 7 },
    allowDraw: { type: 'boolean', default: true },
};

// ----- Auxiliares puros -----

function buildSet() {
    const pieces = [];

    for (let a = 0; a <= 6; a++) {
        for (let b = a; b <= 6; b++) {
            pieces.push([a, b]);
        }
    }

    return pieces;
}

function shuffle(list) {
    const copy = [...list];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

const pips = (piece) => piece[0] + piece[1];
const handPips = (hand) => hand.reduce((sum, piece) => sum + pips(piece), 0);
const sameRank = (a, b) => (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

// Qual(is) ponta(s) aceitam a peça. Mesa vazia aceita qualquer lado.
function sidesFor(state, piece) {
    if (!state.ends) {
        return ['left', 'right'];
    }

    return ['left', 'right'].filter((side) => {
        const end = side === 'left' ? state.ends[0] : state.ends[1];

        return piece[0] === end || piece[1] === end;
    });
}

const playableIndexes = (state, hand) => hand
    .map((piece, index) => ({ piece, index }))
    .filter(({ piece }) => {
        if (state.opening) {
            return sameRank(piece, state.opening);
        }

        return sidesFor(state, piece).length > 0;
    })
    .map(({ index }) => index);

// Peça de abertura: maior dupla; sem duplas, a de maior soma.
function pickOpening(hands) {
    let best = null;

    for (const [playerId, hand] of Object.entries(hands)) {
        for (const piece of hand) {
            const score = (piece[0] === piece[1] ? 100 : 0) + pips(piece);

            if (!best || score > best.score) {
                best = { playerId, piece, score };
            }
        }
    }

    return best;
}

function createState(playerIds, config) {
    const shuffled = shuffle(buildSet());
    const hands = {};

    playerIds.forEach((id, i) => {
        hands[id] = shuffled.slice(i * config.piecesPerPlayer, (i + 1) * config.piecesPerPlayer);
    });

    const boneyard = shuffled.slice(playerIds.length * config.piecesPerPlayer);
    const opening = pickOpening(hands);

    return {
        players: [...playerIds],
        hands,
        boneyard,
        board: [],
        ends: null,
        opening: opening.piece,
        turn: playerIds.indexOf(opening.playerId),
        passes: 0,
        moves: 0,
        last: null,
        winners: null,
        blocked: false,
    };
}

function finish(state, winners, blocked) {
    state.winners = winners;
    state.blocked = blocked;
}

// Fim por trava: vence quem tem menos pontos na mão.
function resolveBlocked(state) {
    const totals = state.players.map((id) => handPips(state.hands[id]));
    const lowest = Math.min(...totals);

    finish(state, state.players.filter((_, i) => totals[i] === lowest), true);
}

const result = (state) => {
    if (!state.winners) {
        return null;
    }

    const scores = {};

    state.players.forEach((id) => {
        scores[id] = handPips(state.hands[id]);
    });

    return { winners: state.winners, scores };
};

// ----- Ações (alteram o clone recebido; devolvem mensagem de erro ou null) -----

function playPiece(state, playerId, index, side) {
    const hand = state.hands[playerId];

    if (!Number.isInteger(index) || index < 0 || index >= hand.length) {
        return 'Peça inválida.';
    }

    if (!playableIndexes(state, hand).includes(index)) {
        return state.opening ? 'A primeira jogada deve ser a peça de abertura.' : 'Essa peça não encaixa na mesa.';
    }

    const piece = hand[index];
    const allowed = sidesFor(state, piece);
    const chosen = side || allowed[0];

    if (!allowed.includes(chosen)) {
        return 'Essa peça não encaixa nessa ponta.';
    }

    const first = !state.ends;

    // Orienta a peça para que o lado de contato fique voltado para a mesa.
    let placed = [piece[0], piece[1]];

    if (!state.ends) {
        state.ends = [placed[0], placed[1]];
        state.board.push(placed);
    }
    else if (chosen === 'left') {
        placed = piece[1] === state.ends[0] ? [piece[0], piece[1]] : [piece[1], piece[0]];
        state.ends[0] = placed[0];
        state.board.unshift(placed);
    }
    else {
        placed = piece[0] === state.ends[1] ? [piece[0], piece[1]] : [piece[1], piece[0]];
        state.ends[1] = placed[1];
        state.board.push(placed);
    }

    hand.splice(index, 1);
    state.opening = null;
    state.passes = 0;
    state.moves += 1;
    state.last = { playerId, side: first ? 'center' : chosen, n: state.moves };

    if (hand.length === 0) {
        finish(state, [playerId], false);
    }
    else {
        state.turn = (state.turn + 1) % state.players.length;
    }

    return null;
}

function drawPiece(state, playerId, config) {
    if (!config.allowDraw) {
        return 'Compra não permitida nesta partida.';
    }

    if (playableIndexes(state, state.hands[playerId]).length > 0) {
        return 'Você tem peça para jogar.';
    }

    if (state.boneyard.length === 0) {
        return 'O monte está vazio.';
    }

    state.hands[playerId].push(state.boneyard.pop());

    return null;
}

function pass(state, playerId, config) {
    if (playableIndexes(state, state.hands[playerId]).length > 0) {
        return 'Você tem peça para jogar.';
    }

    if (config.allowDraw && state.boneyard.length > 0) {
        return 'Compre do monte antes de passar.';
    }

    state.passes += 1;

    if (state.passes >= state.players.length) {
        resolveBlocked(state);
    }
    else {
        state.turn = (state.turn + 1) % state.players.length;
    }

    return null;
}

// ----- Visões -----

function view(state, playerId) {
    const mine = state.hands[playerId] || [];
    const turnId = state.players[state.turn];

    return {
        game: 'domino',
        board: state.board,
        ends: state.ends,
        turn: turnId,
        myTurn: !state.winners && turnId === playerId,
        opening: playerId === turnId ? state.opening : null,
        hand: mine,
        playable: !state.winners && turnId === playerId ? playableIndexes(state, mine) : [],
        boneyard: state.boneyard.length,
        opponents: state.players
            .filter((id) => id !== playerId)
            .map((id) => ({ uid: id, count: state.hands[id].length })),
        last: state.last,
        winners: state.winners,
        blocked: state.blocked,
    };
}

// ----- Engine -----

const dominoEngine = {
    id: 'domino',
    version: 1,
    capabilities: ['bots'],

    getMetadata() {
        return {
            id: 'domino',
            name: 'Dominó',
            description: 'Dominó tradicional: encaixe as pontas e bata primeiro.',
            icon: '🁣',
            minPlayers: MIN_PLAYERS,
            maxPlayers: MAX_PLAYERS,
            botNames: BOT_NAMES,
        };
    },

    getConfigSchema() {
        return CONFIG_SCHEMA;
    },

    normalizeConfig(config) {
        return ok({ config: normalizeBySchema(CONFIG_SCHEMA, config) });
    },

    validatePlayers(players) {
        if (!Array.isArray(players) || players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
            return fail(ERROR_CODES.INVALID_PLAYERS, `Use de ${MIN_PLAYERS} a ${MAX_PLAYERS} jogadores.`);
        }

        return ok();
    },

    createMatch({ config, players }) {
        const state = createState(players.map((player) => player.id), config);

        return transition({ state, events: [{ type: 'match-created' }] });
    },

    startMatch({ state }) {
        return transition({ state, events: [{ type: 'match-started' }] });
    },

    handleAction({ state, config }, command) {
        const { playerId, type } = command || {};
        const payload = command && command.payload ? command.payload : {};

        if (state.winners) {
            return fail(ERROR_CODES.MATCH_FINISHED, 'A partida já terminou.');
        }

        if (!['play-piece', 'draw-piece', 'pass'].includes(type)) {
            return fail(ERROR_CODES.UNKNOWN_ACTION, 'Ação desconhecida.');
        }

        if (state.players[state.turn] !== playerId) {
            return fail(ERROR_CODES.INVALID_ACTION, 'Não é a sua vez.');
        }

        const next = structuredClone(state);
        let error;

        if (type === 'play-piece') {
            error = playPiece(next, playerId, payload.index, payload.side);
        }
        else if (type === 'draw-piece') {
            error = drawPiece(next, playerId, config);
        }
        else {
            error = pass(next, playerId, config);
        }

        if (error) {
            return fail(ERROR_CODES.INVALID_ACTION, error);
        }

        return transition({
            state: next,
            events: [{ type: `${type}-done`, payload: { playerId } }],
            result: result(next),
        });
    },

    // Espectador: sem mão.
    getPublicState({ state }) {
        return view(state, null);
    },

    getPlayerView({ state }, playerId) {
        return view(state, playerId);
    },

    isFinished({ state }) {
        return Boolean(state.winners);
    },

    getResult({ state }) {
        return result(state);
    },

    // null = não é a vez deste jogador. Bot simples: joga a peça mais pesada, senão compra/passa.
    createBotAction({ state, config }, playerId) {
        if (state.winners || state.players[state.turn] !== playerId) {
            return null;
        }

        const hand = state.hands[playerId];
        const playable = playableIndexes(state, hand);

        if (playable.length > 0) {
            const index = playable.reduce((best, i) => (pips(hand[i]) > pips(hand[best]) ? i : best), playable[0]);

            return { playerId, type: 'play-piece', payload: { index, side: sidesFor(state, hand[index])[0] } };
        }

        if (config.allowDraw && state.boneyard.length > 0) {
            return { playerId, type: 'draw-piece', payload: {} };
        }

        return { playerId, type: 'pass', payload: {} };
    },
};

module.exports = dominoEngine;
