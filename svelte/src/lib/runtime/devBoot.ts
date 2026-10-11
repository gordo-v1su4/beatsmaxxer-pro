const KEY='beatsmaxxer.dev.hmr-reload';
let visited=Boolean(import.meta.hot?.data.visited);
if(import.meta.hot){
  import.meta.hot.on('vite:beforeFullReload',()=>{
    try{sessionStorage.setItem(KEY,JSON.stringify({at:Date.now(),url:location.href}));}catch{}
  });
  import.meta.hot.dispose(data=>{data.visited=visited;});
}
/** A developer save can remount the page or force a Vite navigation. */
export function skipDevSplashReplay() {
  if(!import.meta.env.DEV||typeof window==='undefined')return false;
  let hotReload=false;
  try{
    const marker=JSON.parse(sessionStorage.getItem(KEY)||'null');
    sessionStorage.removeItem(KEY);
    hotReload=marker?.url===location.href&&Date.now()-marker.at<10000;
  }catch{}
  const skip=visited||hotReload;visited=true;return skip;
}
