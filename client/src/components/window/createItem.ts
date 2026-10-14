export type NewItemKind = "note" | "folder";

const CREATE_ITEM_EVENT = "createItem";

// The toolbar lives outside the sidebar, which owns the tree its new items are inserted into.
export function requestNewItem(kind: NewItemKind) {
    window.dispatchEvent(new CustomEvent<NewItemKind>(CREATE_ITEM_EVENT, {detail: kind}));
}

export function onNewItemRequest(handler: (kind: NewItemKind) => void): () => void {
    const listener = (e: Event) => handler((e as CustomEvent<NewItemKind>).detail);
    window.addEventListener(CREATE_ITEM_EVENT, listener);
    return () => window.removeEventListener(CREATE_ITEM_EVENT, listener);
}
