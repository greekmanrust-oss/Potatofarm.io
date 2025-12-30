// storage.js — localStorage helpers
(function(){
  const KEY = "potato_farm_pixel_v1";

  function safeParse(raw){
    try{ return JSON.parse(raw); }catch{ return null; }
  }

  window.StorageAPI = {
    key: KEY,
    load(){
      const raw = localStorage.getItem(KEY);
      if(!raw) return null;
      return safeParse(raw);
    },
    save(state){
      localStorage.setItem(KEY, JSON.stringify(state));
    },
    clear(){
      localStorage.removeItem(KEY);
    }
  };
})();
