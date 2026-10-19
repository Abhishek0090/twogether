/** How long after sending a text message it can still be edited. */
export const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** How long after sending a message it can still be deleted for everyone. */
export const DELETE_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Largest upload accepted by /api/media. */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
