const test = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../server/domino.engine');
const { runEngineContractSuite } = require('@bardotiao/game-contract/engine-contract.suite');

const players = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nick: `P${i}`, bot: false }));

function start(n, config = {}) {
    const cfg = engine.normalizeConfig(config).config;
    const base = { matchId: 'm', config: cfg, players: players(n), state: null };
    const created = engine.createMatch(base);

    return { ...base, state: engine.startMatch({ ...base, state: created.state }).state };
}

// Joga com os bots até acabar; devolve o contexto final.
function playOut(context) {
    let current = context;

    while (!engine.isFinished(current)) {
        const id = current.state.players[current.state.turn];
        const step = engine.handleAction(current, engine.createBotAction(current, id));

        assert.equal(step.ok, true, step.error && step.error.message);
        current = { ...current, state: step.state };
    }

    return current;
}

runEngineContractSuite('domino', engine, {
    players: players(3),
    invalidPlayers: players(1),
    validCommand: (context) => engine.createBotAction(context, context.state.players[context.state.turn]),
    invalidCommand: ({ state }) => ({ playerId: state.players[state.turn], type: 'play-piece', payload: { index: 99 } }),
    finish: playOut,
});

test('[domino] distribuição: 7 peças por jogador, 28 no total, sem repetição', () => {
    const { state } = start(2);
    const all = [...Object.values(state.hands).flat(), ...state.boneyard].map(([a, b]) => `${a}-${b}`);

    assert.equal(state.hands.p0.length, 7);
    assert.equal(new Set(all).size, 28);
    assert.equal(all.length, 28);
});

test('[domino] primeira jogada exige a peça de abertura e só vale na vez', () => {
    const context = start(2);
    const { state } = context;
    const starter = state.players[state.turn];
    const other = state.players.find((id) => id !== starter);
    const openIndex = state.hands[starter].findIndex(([a, b]) => a === state.opening[0] && b === state.opening[1] || a === state.opening[1] && b === state.opening[0]);

    assert.equal(engine.handleAction(context, { playerId: other, type: 'play-piece', payload: { index: 0 } }).ok, false);

    const wrong = state.hands[starter].findIndex((_, i) => i !== openIndex);
    assert.equal(engine.handleAction(context, { playerId: starter, type: 'play-piece', payload: { index: wrong } }).ok, false);
    assert.equal(engine.handleAction(context, { playerId: starter, type: 'play-piece', payload: { index: openIndex } }).ok, true);
});

test('[domino] encaixe: peça que não combina é rejeitada; bater encerra com vencedor', () => {
    const context = start(2);
    const state = structuredClone(context.state);

    state.opening = null;
    state.board = [[3, 4]];
    state.ends = [3, 4];
    state.turn = 0;
    state.hands.p0 = [[1, 2], [4, 6]];
    state.hands.p1 = [[0, 0]];

    const ctx = { ...context, state };

    assert.equal(engine.handleAction(ctx, { playerId: 'p0', type: 'play-piece', payload: { index: 0 } }).error.code, 'INVALID_ACTION');

    const step = engine.handleAction(ctx, { playerId: 'p0', type: 'play-piece', payload: { index: 1, side: 'right' } });

    assert.deepEqual(step.state.ends, [3, 6]);
    assert.equal(state.hands.p0.length, 2, 'estado original não é alterado');

    // Bater: com uma só peça restante, jogá-la encerra a partida.
    const last = structuredClone(state);

    last.hands.p0 = [[4, 6]];

    const win = engine.handleAction({ ...ctx, state: last }, { playerId: 'p0', type: 'play-piece', payload: { index: 0, side: 'right' } });

    assert.deepEqual(win.result.winners, ['p0']);
});

test('[domino] jogo travado: vence quem tem menos pontos', () => {
    const context = start(2);
    const state = structuredClone(context.state);

    state.opening = null;
    state.board = [[3, 4]];
    state.ends = [3, 4];
    state.turn = 0;
    state.hands.p0 = [[0, 1]];
    state.hands.p1 = [[0, 0]];
    state.boneyard = [];

    let step = engine.handleAction({ ...context, state }, { playerId: 'p0', type: 'pass', payload: {} });
    step = engine.handleAction({ ...context, state: step.state }, { playerId: 'p1', type: 'pass', payload: {} });

    assert.deepEqual(step.result.winners, ['p1']);
});

test('[domino] partidas completas com 2, 3 e 4 jogadores (com e sem compra) sempre terminam', () => {
    for (const n of [2, 3, 4]) {
        for (const allowDraw of [false, true]) {
            for (let i = 0; i < 20; i++) {
                const end = playOut(start(n, { allowDraw }));

                assert.ok(engine.getResult(end).winners.length >= 1);
            }
        }
    }
});

test('[domino] visão do jogador não revela a mão dos outros', () => {
    const context = start(3);
    const view = engine.getPlayerView(context, 'p0');

    assert.equal(view.hand.length, 7);
    assert.ok(view.opponents.every((o) => o.count === 7 && o.hand === undefined));
    assert.equal(JSON.stringify(engine.getPublicState(context)).includes('"hand":[['), false);
});

test('[domino] compra é padrão: sem peça compra do monte limitado; monte vazio obriga passar', () => {
    const context = start(2);
    const state = structuredClone(context.state);

    assert.equal(context.config.allowDraw, true);
    state.opening = null;
    state.board = [[3, 4]];
    state.ends = [3, 4];
    state.turn = 0;
    state.hands.p0 = [[0, 0]];
    state.hands.p1 = [[1, 1]];
    state.boneyard = [[5, 5]];

    assert.equal(engine.handleAction({ ...context, state }, { playerId: 'p0', type: 'pass', payload: {} }).ok, false);

    const drew = engine.handleAction({ ...context, state }, { playerId: 'p0', type: 'draw-piece', payload: {} });

    assert.equal(drew.state.hands.p0.length, 2);
    assert.equal(drew.state.boneyard.length, 0);
    assert.equal(engine.handleAction({ ...context, state: drew.state }, { playerId: 'p0', type: 'draw-piece', payload: {} }).ok, false);
    assert.equal(engine.handleAction({ ...context, state: drew.state }, { playerId: 'p0', type: 'pass', payload: {} }).ok, true);
});

test('[domino] visão informa a última jogada (para animação)', () => {
    const context = start(2);
    const id = context.state.players[context.state.turn];
    const step = engine.handleAction(context, engine.createBotAction(context, id));
    const view = engine.getPlayerView({ ...context, state: step.state }, id);

    assert.deepEqual(view.last, { playerId: id, side: 'center', n: 1 });
});
