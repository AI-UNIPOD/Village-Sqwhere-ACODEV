export const THEME_KEY = "vs-theme";

// Runs before first paint (the first thing in the body, see the layout), so the page never
// flashes the other theme. A theme the visitor saved wins; a first visit, or a browser that
// blocks storage, opens in dark. The browser's own bars (theme-color) take the page's
// background straight away too, instead of following the system until the page has loaded.
export const THEME_INIT_SCRIPT = `(function(){var t,d=document.documentElement;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}d.setAttribute("data-theme",t==="light"?"light":"dark");try{var c=getComputedStyle(d).getPropertyValue("--bg").trim();if(c)document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c})}catch(e){}})()`;
