export const THEME_KEY = "vs-theme";

// Runs before first paint (see the layout) so a saved choice never flashes the other theme.
// With no saved choice, tokens.css follows the system setting on its own.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
