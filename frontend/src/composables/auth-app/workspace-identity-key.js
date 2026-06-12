export function workspaceIdentityKey(state) {
    return state.kind === 'authenticated' ? state.username : '∅';
}
