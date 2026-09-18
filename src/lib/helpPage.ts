/** Static user guide in `public/help.html`, outside the React app. */
export const HELP_PAGE_FILE = `${import.meta.env.BASE_URL}help.html`;
export const HELP_PAGE_ROUTE = "/help";

export function isHelpRoute(pathname: string): boolean {
  return pathname === "/help" || pathname === "/help/";
}
