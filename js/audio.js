// audio.js — lightweight 8-bit SFX + chiptune loop (WebAudio)
(function(){
  let ctx = null;
  let master = null;
  let musicGain = null;
  let sfxGain = null;

  const state = { musicOn:true, sfxOn:true, playing:false };

  function ensure(){
    if(ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    musicGain = ctx.createGain();
    sfxGain = ctx.createGain();
    master.gain.value = 0.55;
    musicGain.gain.value = 0.35;
    sfxGain.gain.value = 0.55;

    musicGain.connect(master);
    sfxGain.connect(master);
    master.connect(ctx.destination);
  }

  function resume(){
    ensure();
    if(ctx.state === "suspended") ctx.resume();
  }

  function setMusic(on){ state.musicOn = !!on; if(!on) stopMusic(); }
  function setSfx(on){ state.sfxOn = !!on; }

  function beep(freq=440, dur=0.08, type="square", vol=0.25){
    if(!state.sfxOn) return;
    resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(sfxGain);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.start(t);
    o.stop(t+dur+0.02);
  }

  function chord(freqs=[440,550,660], dur=0.10){
    freqs.forEach((f,i)=> beep(f, dur, "square", 0.12));
  }

  // Simple chiptune loop
  let musicTimer = null;
  let step = 0;

  const scale = [0,2,4,7,9,12]; // major-ish
  function noteFreq(base, semis){
    return base * Math.pow(2, semis/12);
  }

  function startMusic(){
    if(!state.musicOn) return;
    resume();
    if(musicTimer) return;

    state.playing = true;
    step = 0;

    musicTimer = setInterval(()=>{
      if(!state.musicOn) return;

      // 8-bit arpeggio + bass
      const base = 220;
      const s = scale[step % scale.length];
      const lead = noteFreq(base, s + (step%12<6?12:24));
      const bass = noteFreq(110, (step%8<4?0:7));

      // short notes
      playNote(lead, 0.09, 0.08, "square");
      if(step % 2 === 0) playNote(bass, 0.11, 0.06, "triangle");

      step++;
    }, 120);
  }

  function stopMusic(){
    if(musicTimer){
      clearInterval(musicTimer);
      musicTimer = null;
    }
    state.playing = false;
  }

  function playNote(freq, dur, vol, type){
    if(!state.musicOn) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(musicGain);

    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
    o.start(t);
    o.stop(t+dur+0.02);
  }

  const SFX = {
    plant(){ beep(660,0.06,"square",0.22); beep(880,0.05,"square",0.14); },
    harvest(){ chord([523,659,784],0.08); },
    sell(){ beep(988,0.05,"square",0.20); beep(1318,0.06,"square",0.14); },
    buy(){ beep(740,0.06,"square",0.18); },
    upgrade(){ chord([392,494,659],0.10); },
    achieve(){ chord([659,784,988],0.14); },
    error(){ beep(180,0.10,"square",0.16); }
  };

  window.Audio8 = {
    state,
    ensure, resume,
    setMusic, setSfx,
    startMusic, stopMusic,
    sfx:SFX
  };
})();
