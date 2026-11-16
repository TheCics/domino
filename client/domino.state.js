// Estado da interface do Dominó: visão recebida do servidor e resultado final.
const dominoState = { game: null, result: null, selected: null, lastKey: null };

function resetDominoState() {
    dominoState.game = null;
    dominoState.result = null;
    dominoState.selected = null;
    dominoState.lastKey = null;
}

export { dominoState, resetDominoState };
