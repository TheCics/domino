/**
 * ============================================================================
 * ARQUIVO: domino.module.js
 * LOCAL: client/src/features/games/domino/domino.module.js
 * ============================================================================
 *
 * DESCRIÇÃO:
 * Módulo de interface do Dominó para o game.manager (mesmo formato do Uno).
 * Comandos enviados pelo evento genérico game:action: play-piece, draw-piece e pass.
 *
 * DATA DE CRIAÇÃO: 08/11/2026 (Etapa 5).
 *
 * AUTOR: Viana-78
 *
 * ============================================================================
 */

import './domino.styles.css';
import { emit } from './portal.js';
import { render } from './portal.js';
import { val } from '@bardotiao/ui';
import { matchResultModal } from './portal.js';
import { dominoState, resetDominoState } from './domino.state.js';
import { dominoGameView } from './domino.view.js';

const dominoActions = {
    // Clicar numa peça jogável a seleciona (destaca as pontas); na abertura joga direto.
    dominoSelect({ i }) {
        const index = Number(i);
        if (!dominoState.game.ends) {
            return emit('game:action', { type: 'play-piece', payload: { index } });
        }
        dominoState.selected = dominoState.selected === index ? null : index;
        render();
    },

    dominoPlace({ side }) {
        const index = dominoState.selected;
        dominoState.selected = null;
        emit('game:action', { type: 'play-piece', payload: { index, side } });
    },

    dominoDraw() {
        emit('game:action', { type: 'draw-piece' });
    },

    dominoPass() {
        emit('game:action', { type: 'pass' });
    },
};

const dominoModule = {
    id: 'domino',
    reset: resetDominoState,
    hasGame: () => Boolean(dominoState.game),
    clearResult() {
        dominoState.result = null;
    },
    screen: dominoGameView,
    emptyScreen: () => '<div class="screen game"><div class="table"><div class="felt"></div></div></div>',
    modal: () => (dominoState.result && !dominoState.game ? matchResultModal(dominoState.result) : ''),
    actions: dominoActions,
    events: {
        onView(game) {
            dominoState.game = game;
            dominoState.result = null;
            dominoState.selected = null;
        },
        onEnded() {
            dominoState.game = null;
        },
        onOver(result) {
            dominoState.game = null;
            dominoState.result = result;
        },
    },
    configFields: (settings, disabled) => `
        <label>Peças por jogador <input id="s-pieces" data-sync="1" data-change type="number" min="5" max="7" value="${settings.config?.piecesPerPlayer}" ${disabled}></label>
        <label class="chk"><input id="s-allow-draw" data-sync="1" data-change type="checkbox" ${settings.config?.allowDraw ? 'checked' : ''} ${disabled}> Permitir comprar do monte</label>`,
    readConfig: () => ({
        piecesPerPlayer: val('s-pieces'),
        allowDraw: !!document.getElementById('s-allow-draw')?.checked,
    }),
    ruleText(settings) {
        const { piecesPerPlayer, allowDraw } = settings.config || {};
        return `${settings.rounds} round${settings.rounds > 1 ? 's' : ''} · ${piecesPerPlayer} peças${allowDraw ? ' · com compra' : ''}`;
    },
};

export { dominoModule };
