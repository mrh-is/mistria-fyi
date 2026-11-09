import { localizeRequest } from "../request-locale.js";

/** @param {{event: Parameters<typeof localizeRequest>[0], resolve: Parameters<typeof localizeRequest>[1]}} input */
export const handle = ({ event, resolve }) => localizeRequest(event, resolve).render();
