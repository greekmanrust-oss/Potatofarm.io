// ui.js — UI helpers (tabs, toast, tutorial)
(function(){
  const $ = (q, r=document) => r.querySelector(q);
  const $$ = (q, r=document) => Array.from(r.querySelectorAll(q));

  function toast(msg){
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(toast._t);
    toast._t = setTimeout(()=> el.classList.remove("on"), 1300);
  }

  function setHint(msg){
    const el = $("#hintText");
    if(el) el.textContent = msg;
  }

  // Tabs
  function initTabs(){
    const tabs = $$(".tab");
    tabs.forEach(btn=>{
      btn.addEventListener("click", ()=>{
        tabs.forEach(t=> t.classList.remove("active"));
        btn.classList.add("active");

        const id = btn.dataset.tab;
        $$(".tabPanel").forEach(p=> p.classList.remove("active"));
        $("#tab-" + id).classList.add("active");

        tabs.forEach(t=> t.setAttribute("aria-selected", String(t===btn)));
      });
    });
  }

  // Tutorial (mini onboarding)
  function initTutorial(steps, onDone){
    const overlay = $("#tutorial");
    const title = $("#tutorialTitle");
    const body = $("#tutorialBody");
    const dots = $("#tutorialDots");
    const btnBack = $("#tutorialBack");
    const btnNext = $("#tutorialNext");
    const btnClose = $("#tutorialClose");

    let idx = 0;

    function render(){
      const s = steps[idx];
      title.textContent = s.title;
      body.innerHTML = s.html;

      dots.innerHTML = "";
      for(let i=0;i<steps.length;i++){
        const d = document.createElement("span");
        if(i===idx) d.classList.add("on");
        dots.appendChild(d);
      }

      btnBack.disabled = idx === 0;
      btnNext.textContent = (idx === steps.length-1) ? "Finish" : "Next";
    }

    function open(){
      overlay.classList.remove("hidden");
      idx = 0;
      render();
    }
    function close(){
      overlay.classList.add("hidden");
    }

    btnBack.addEventListener("click", ()=>{
      if(idx>0){ idx--; render(); }
    });
    btnNext.addEventListener("click", ()=>{
      if(idx < steps.length-1){ idx++; render(); return; }
      close();
      onDone?.();
    });
    btnClose.addEventListener("click", ()=>{
      close();
      onDone?.();
    });

    return { open, close };
  }

  window.UI = { toast, setHint, initTabs, initTutorial, $, $$ };
})();
