/* ═══════════════════════════════════════════════════════════════
   NEOS Chantier — Participants & signatures
   (rapport d'ouverture et rapport de fermeture)
   ───────────────────────────────────────────────────────────────
   - Par défaut : Participant 1 = NEOS, Participant 2 = vide.
   - « ＋ Ajouter un participant » ajoute une carte ; les participants
     ajoutés (à partir du 3e) peuvent être retirés.
   - Sur mobile, chaque carte prend toute la largeur avec une grande
     zone de signature. La zone se redimensionne toute seule (changement
     d'onglet, rotation du téléphone) sans perdre la signature.

   Stockage (clés du document, inchangées) :
     participants_count, participant_<n>, signature_<n> (PNG)

   Usage :
     NeosParticipants.mount(container, { get:(k,def)=>…, set:(k,v)=>… });
     NeosParticipants.entries(get)  → [{ n, text, sig }] pour le PDF
═══════════════════════════════════════════════════════════════ */
(function(global){
  const MIN = 2;
  const DEFAULTS = { 1: 'NEOS\nKhalil NEFFATI' };

  function text(get, n){ return get('participant_'+n, DEFAULTS[n] || ''); }

  function count(get){
    const stored = parseInt(get('participants_count', ''), 10);
    if (stored >= MIN) return stored;
    // Anciens rapports (5 cases fixes) : on garde ceux qui sont remplis
    let max = MIN;
    for (let n = 1; n <= 5; n++) {
      if ((get('participant_'+n, '') || '').trim() || get('signature_'+n, '')) max = Math.max(max, n);
    }
    return max;
  }

  function entries(get){
    const out = [];
    for (let n = 1; n <= count(get); n++) out.push({ n, text: text(get, n), sig: get('signature_'+n, '') });
    return out;
  }

  /* ── Zone de signature ── */
  function signaturePad(canvas, load, save){
    const ctx = canvas.getContext('2d');
    let drawing = false, last = null, w = 0, h = 0;

    function redraw(){
      const r = canvas.getBoundingClientRect();
      if (r.width < 5) return; // onglet caché : on attend qu'il s'affiche
      const ratio = global.devicePixelRatio || 1;
      if (Math.round(r.width) === w && Math.round(r.height) === h) return;
      w = Math.round(r.width); h = Math.round(r.height);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      const saved = load();
      if (saved) {
        const img = new Image();
        img.onload = () => {
          // Redessine sans déformer (la zone a pu changer de proportions)
          const k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
          const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
          ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        };
        img.src = saved;
      }
    }
    const pos = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', e => {
      e.preventDefault(); redraw();
      drawing = true; last = pos(e);
      canvas.setPointerCapture?.(e.pointerId);
      ctx.beginPath(); ctx.arc(last.x, last.y, 1, 0, Math.PI * 2); ctx.fillStyle = '#111'; ctx.fill();
    });
    canvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    });
    const end = () => { if (!drawing) return; drawing = false; save(canvas.toDataURL('image/png')); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    if ('ResizeObserver' in global) new ResizeObserver(redraw).observe(canvas);
    else global.addEventListener('resize', redraw);
    setTimeout(redraw, 0);

    return {
      clear(){ ctx.clearRect(0, 0, canvas.width, canvas.height); save(''); }
    };
  }

  /* ── Liste des participants ── */
  function mount(container, { get, set }){
    container.innerHTML = '<div class="pt-list"></div><button type="button" class="pt-add">＋ Ajouter un participant</button>';
    const list = container.querySelector('.pt-list');

    function render(){
      list.innerHTML = '';
      const total = count(get);
      for (let n = 1; n <= total; n++) {
        const card = document.createElement('div');
        card.className = 'pt-card';
        card.innerHTML = `
          <div class="pt-head"><span>Participant ${n}</span>${n > MIN ? '<button type="button" class="pt-remove">✕ Retirer</button>' : ''}</div>
          <textarea placeholder="Société&#10;Nom Prénom"></textarea>
          <div class="pt-sig-label"><span>✍️ Signature</span><button type="button" class="pt-sig-clear">Effacer</button></div>
          <div class="pt-sig-wrap"><canvas></canvas></div>`;
        const ta = card.querySelector('textarea');
        ta.value = text(get, n);
        ta.oninput = () => set('participant_'+n, ta.value);
        const pad = signaturePad(card.querySelector('canvas'), () => get('signature_'+n, ''), v => set('signature_'+n, v));
        card.querySelector('.pt-sig-clear').onclick = () => pad.clear();
        const rm = card.querySelector('.pt-remove');
        if (rm) rm.onclick = () => remove(n);
        list.appendChild(card);
      }
    }

    function remove(n){
      const total = count(get);
      const who = (text(get, n) || '').split('\n').filter(Boolean).join(' — ');
      if (!confirm(`Retirer le participant ${n}${who ? ' (' + who + ')' : ''} et sa signature ?`)) return;
      for (let k = n; k < total; k++) {
        set('participant_'+k, get('participant_'+(k+1), ''));
        set('signature_'+k, get('signature_'+(k+1), ''));
      }
      set('participant_'+total, '');
      set('signature_'+total, '');
      set('participants_count', String(total - 1));
      render();
    }

    container.querySelector('.pt-add').onclick = () => {
      const total = count(get) + 1;
      set('participants_count', String(total));
      render();
      const cards = list.querySelectorAll('.pt-card');
      const lastCard = cards[cards.length - 1];
      lastCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      lastCard.querySelector('textarea').focus({ preventScroll: true });
    };

    render();
  }

  global.NeosParticipants = { mount, entries, count };
})(window);
