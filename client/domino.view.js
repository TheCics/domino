/**
 * ============================================================================
 * ARQUIVO: domino.view.js
 * LOCAL: client/src/features/games/domino/domino.view.js
 * ============================================================================
 *
 * DESCRIÇÃO:
 * Tela da partida de Dominó (base crua): oponentes, mesa, ações e mão do jogador.
 * Só desenha a visão recebida; quem valida a jogada é o servidor.
 *
 * DATA DE CRIAÇÃO: 08/11/2026 (Etapa 5).
 *
 * AUTOR: Viana-78
 *
 * ============================================================================
 */

import { esc } from '@bardotiao/ui';
import { avatar } from '@bardotiao/ui';
import { authState } from './portal.js';
import { roomsState, nickOf } from './portal.js';
import { chatBox } from './portal.js';
import { dominoState } from './domino.state.js';

// Posição dos pontos (0-8) em uma grade 3x3 para cada valor.
const PIPS = {
    0: [],
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
};

function half(value) {
    const cells = Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[value].includes(i) ? 'on' : ''}"></i>`).join('');
    return `<div class="dhalf">${cells}</div>`;
}

function piece(tile, cls = 'h', attrs = '', size = 46) {
    return `<div class="dpiece ${cls}" style="--ps:${size}px" ${attrs}>${half(tile[0])}${half(tile[1])}</div>`;
}

function back(size) {
    return `<div class="dpiece v back" style="--ps:${size}px"><div class="dhalf"></div><div class="dhalf"></div></div>`;
}

// Tamanho da peça para a linha inteira caber na largura da tela (mínimo 8px; abaixo disso rola).
function fitSize(slots, max = 46) {
    const width = Math.min(window.innerWidth, 1100) - 16;
    return Math.max(10, Math.min(max, Math.floor((width / Math.max(slots, 1) - 6) / 2)));
}

// Quais pontas aceitam a peça (dica visual; o servidor valida).
function sidesThatFit(game, [a, b]) {
    const sides = [];
    if (a === game.ends[0] || b === game.ends[0])
        sides.push('left');
    if (a === game.ends[1] || b === game.ends[1])
        sides.push('right');
    return sides;
}

function handHtml(game) {
    const size = Math.min(46, Math.floor((Math.min(window.innerWidth, 1100) - 24) / Math.max(game.hand.length, 1) - 8));
    return game.hand.map((tile, i) => {
        const playable = game.playable.includes(i);
        const cls = `v ${playable ? 'playable' : game.myTurn ? 'dim' : ''} ${dominoState.selected === i ? 'selected' : ''}`;
        return piece(tile, cls, playable ? `data-act="dominoSelect" data-i="${i}"` : '', Math.max(size, 14));
    }).join('');
}

function boardHtml(game) {
    if (!game.board.length)
        return '<small class="muted">Mesa vazia</small>';
    const picked = dominoState.selected;
    const fits = picked !== null && game.hand[picked] ? sidesThatFit(game, game.hand[picked]) : [];
    const size = fitSize(game.board.length + fits.length);
    const me = game.last?.playerId === authState.uid;
    const fresh = game.last && dominoState.lastKey !== game.last.n;
    const newIndex = game.last?.side === 'left' ? 0 : game.board.length - 1;
    dominoState.lastKey = game.last ? game.last.n : null;
    const ghost = (side) => (fits.includes(side)
        ? `<button class="dghost" style="--ps:${size}px" data-act="dominoPlace" data-side="${side}" aria-label="Jogar na ponta ${side === 'left' ? 'esquerda' : 'direita'}">${side === 'left' ? '◀' : '▶'}</button>`
        : '');
    const tiles = game.board.map((tile, i) => piece(
        tile,
        `h ${fresh && i === newIndex ? (me ? 'arrive-me' : 'arrive-op') : ''}`,
        '',
        size,
    )).join('');
    return `${ghost('left')}${tiles}${ghost('right')}`;
}

function opponentsHtml(game) {
    const size = Math.max(10, Math.min(22, Math.floor((Math.min(window.innerWidth, 1100) / Math.max(game.opponents.length, 1) - 40) / 14)));
    return game.opponents.map((opponent) => {
        const player = roomsState.room.players.find((candidate) => candidate.uid === opponent.uid);
        const turn = game.turn === opponent.uid ? 'turn' : '';
        const backs = Array.from({ length: opponent.count }, () => back(size)).join('');
        return `<div class="dopp ${turn}"><div class="nameplate">${avatar(player?.nick || '?', 'sm')}<b>${esc(player?.nick || '?')}</b>${player?.bot ? '<span class="tagx">BOT</span>' : ''}<em class="cnt">${opponent.count}</em></div><div class="dbacks">${backs}</div></div>`;
    }).join('');
}

function actionsHtml(game, config) {
    if (!game.myTurn || game.playable.length > 0)
        return '';
    if (config.allowDraw && game.boneyard > 0)
        return '<button class="btn primary" data-act="dominoDraw">Comprar peça</button>';
    return '<button class="btn primary" data-act="dominoPass">Passar a vez</button>';
}

function dominoGameView() {
    const game = dominoState.game;
    const room = roomsState.room;
    const config = room.settings.config || {};
    const turnText = game.myTurn
        ? '<span class="turnpill me">👉 Sua vez!</span>'
        : `<span class="turnpill">Vez de ${esc(nickOf(game.turn))}</span>`;
    const pick = game.myTurn && game.board.length && game.playable.length && dominoState.selected === null
        ? '<small class="muted">Toque numa peça destacada e depois na ponta.</small>' : '';
    const opening = game.opening ? '<small class="muted">Jogue a peça de abertura (maior dupla).</small>' : '';
    const ends = game.ends ? `<span class="dend">Pontas: ${game.ends[0]} · ${game.ends[1]}</span>` : '';
    const board = boardHtml(game);
    const chat = roomsState.chatOpen
        ? `<aside class="chatdrawer"><div class="mhead"><h3>Chat</h3><button class="x" data-act="chatToggle">✕</button></div>${chatBox()}</aside>`
        : '';
    const chatCount = roomsState.chat.length ? ` (${roomsState.chat.length})` : '';
    return `
        <div class="screen game">
            <header class="gbar">
                <div><b>${esc(room.name)}</b><small>Round ${room.round}/${room.settings.rounds} · Dominó</small></div>
                <div class="row"><button class="btn ghost sm" data-act="chatToggle">💬 Chat${chatCount}</button><button class="btn ghost sm" data-act="leaveGame">Menu</button></div>
            </header>
            <div class="dtable"><div class="felt"></div>
                <div class="dtop">${opponentsHtml(game)}<span class="turnpill">Monte: ${game.boneyard}</span>${ends}</div>
                <div class="dboard">${board}</div>
            </div>
            <footer class="mine">${turnText}${opening}${pick}${actionsHtml(game, config)}<div class="dhand">${handHtml(game)}</div></footer>${chat}
        </div>`;
}

export { dominoGameView };
