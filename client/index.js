/**
 * ============================================================================
 * ARQUIVO: index.js
 * LOCAL: packages/domino/client/index.js
 * ============================================================================
 *
 * DESCRIÇÃO:
 * Entrada do Dominó para o portal: `register(host)` guarda o host e devolve o módulo de interface
 * no formato que o game.manager do portal espera.
 *
 * DATA DE CRIAÇÃO: 11/11/2026.
 *
 * AUTOR: Viana-78
 *
 * ============================================================================
 */

import { bindHost } from './portal.js';
import { dominoModule } from './domino.module.js';

function register(host) {
    bindHost(host);
    return dominoModule;
}

export { register, dominoModule };
