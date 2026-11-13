/* ═══════════════════════════════════════════════════════════════
   NEOS Chantier — Prise de photo commune à tous les documents
   ───────────────────────────────────────────────────────────────
   Même fonctionnement partout (modèle : rapport d'ouverture) :
     📷 Photo   → ouvre l'appareil photo du téléphone
     🖼 Galerie → choisit une ou plusieurs images existantes
     Plusieurs photos par catégorie, chacune avec :
       🗑 Supprimer (toujours visible, avec confirmation)
       ✏️ Annoter  (uniquement là où c'est activé : rapport VT)
     Toucher une miniature l'affiche en grand.

   Les photos sont réduites (1600 px max, JPEG) avant d'être
   enregistrées : sans ça, quelques photos de téléphone suffisent à
   remplir la mémoire du navigateur (~5 Mo).

   Format d'une photo : { src: dataURL, orig?: dataURL avant annotation }
   (les anciennes photos, simples dataURL, sont acceptées telles quelles)

   Usage :
     const el = NeosPhotos.card({
       title: 'Photo Site 1',          // libellé de la catégorie
       num: 3,                         // optionnel : numéro affiché
       get: () => [...],               // renvoie la liste actuelle
       set: (list) => true|false,      // enregistre ; false si échec
       annotate: false,                // true pour permettre l'annotation
       comment: { get, set },          // optionnel : zone de commentaire
       inline: false,                  // true : carte insérée dans un formulaire
       onChange: () => {}              // optionnel : après chaque modification
     });
═══════════════════════════════════════════════════════════════ */
(function(global){
  const MAX_DIM = 1600, QUALITY = 0.8;

  function src(p){ return typeof p === 'string' ? p : (p && p.src) || ''; }
  function norm(p){ return typeof p === 'string' ? { src:p } : { ...p }; }
  function toast(msg, d){ if (typeof global.showToast === 'function') global.showToast(msg, d); }

  /* ── Compression ── */
  function loadImage(url){
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  }
  function readAsDataURL(file){
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  async function compress(file){
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', QUALITY);
    } catch(e) {
      return readAsDataURL(file); // format non décodable : on garde l'original
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /* ── Carte photo ── */
  let uid = 0;
  function card(opts){
    const id = 'np' + (++uid);
    const el = document.createElement('div');
    el.className = 'np-card' + (opts.inline ? ' np-inline' : '');
    el.innerHTML = `
      <div class="np-head">
        ${opts.num != null ? `<span class="np-num">${String(opts.num).padStart(2,'0')}</span>` : ''}
        <span class="np-title"></span>
        <span class="np-count"></span>
      </div>
      <div class="np-thumbs"></div>
      <div class="np-actions">
        <input type="file" accept="image/*" capture="environment" multiple id="${id}-cam">
        <input type="file" accept="image/*" multiple id="${id}-gal">
        <button type="button" class="np-btn np-btn-cam">📷 Photo</button>
        <button type="button" class="np-btn np-btn-gal">🖼 Galerie</button>
      </div>`;
    el.querySelector('.np-title').textContent = opts.title;
    const thumbs = el.querySelector('.np-thumbs');
    const count  = el.querySelector('.np-count');
    const cam = el.querySelector('#'+id+'-cam'), gal = el.querySelector('#'+id+'-gal');
    el.querySelector('.np-btn-cam').onclick = () => cam.click();
    el.querySelector('.np-btn-gal').onclick = () => gal.click();

    if (opts.comment) {
      const ta = document.createElement('textarea');
      ta.className = 'np-comment';
      ta.placeholder = 'Commentaire (optionnel)...';
      ta.value = opts.comment.get() || '';
      ta.oninput = () => opts.comment.set(ta.value);
      el.appendChild(ta);
    }

    const list = () => (opts.get() || []).map(norm);
    const save = (arr) => {
      const ok = opts.set(arr) !== false;
      if (ok && opts.onChange) opts.onChange();
      return ok;
    };

    function render(){
      const photos = list();
      thumbs.innerHTML = '';
      photos.forEach((p, i) => {
        const t = document.createElement('div');
        t.className = 'np-thumb';
        t.innerHTML = `<img alt="">${p.orig ? '<span class="np-tag">✏️ annotée</span>' : ''}
          <div class="np-thumb-bar">
            ${opts.annotate ? '<button type="button" class="np-ann" title="Annoter">✏️</button>' : ''}
            <button type="button" class="np-del" title="Supprimer la photo">🗑</button>
          </div>`;
        t.querySelector('img').src = p.src;
        t.querySelector('img').onclick = () => openViewer(p.src);
        t.querySelector('.np-del').onclick = () => {
          if (!confirm(`Supprimer cette photo (${opts.title}) ?`)) return;
          const arr = list(); arr.splice(i, 1);
          save(arr); render();
          toast(`🗑 Photo supprimée — ${opts.title}`);
        };
        const ann = t.querySelector('.np-ann');
        if (ann) ann.onclick = () => openAnnotate(p, (updated) => {
          const arr = list(); arr[i] = updated;
          if (!save(arr)) { toast('⚠ Mémoire pleine : annotation non enregistrée', 5000); return; }
          render();
          toast(`✔ Annotation enregistrée — ${opts.title}`);
        });
        thumbs.appendChild(t);
      });
      count.textContent = photos.length + ' photo' + (photos.length > 1 ? 's' : '');
      count.classList.toggle('show', photos.length > 0);
      el.classList.toggle('has-photo', photos.length > 0);
    }

    async function onFiles(input){
      const files = Array.from(input.files || []);
      input.value = '';
      if (!files.length) return;
      toast('⏳ Traitement de la photo…', 1500);
      const added = [];
      for (const f of files) {
        try { added.push({ src: await compress(f) }); } catch(e) {}
      }
      if (!added.length) { toast('⚠ Impossible de lire cette image', 4000); return; }
      const before = list();
      if (!save(before.concat(added))) {
        opts.set(before);
        toast('⚠ Mémoire pleine : photo non enregistrée. Supprimez des photos ou exportez puis videz un rapport.', 6000);
        return;
      }
      render();
      toast(`✔ ${added.length} photo(s) — ${opts.title}`);
    }
    cam.onchange = () => onFiles(cam);
    gal.onchange = () => onFiles(gal);

    el.refresh = render;
    render();
    return el;
  }

  /* ── Aperçu plein écran ── */
  let viewer;
  function openViewer(url){
    if (!viewer) {
      viewer = document.createElement('div');
      viewer.className = 'np-modal np-viewer';
      viewer.innerHTML = `<img alt=""><button type="button" class="np-mbtn cancel">Fermer</button>`;
      viewer.onclick = () => viewer.classList.remove('show');
      document.body.appendChild(viewer);
    }
    viewer.querySelector('img').src = url;
    viewer.classList.add('show');
  }

  /* ── Annotation (dessin sur la photo) ── */
  const COLORS = ['#ff3b30','#ffcc00','#0a84ff','#34c759','#ffffff'];
  let ann, annColor = COLORS[0];
  function buildAnnotate(){
    ann = document.createElement('div');
    ann.className = 'np-modal';
    ann.innerHTML = `
      <div class="np-box">
        <h2>✏️ Annoter la photo</h2>
        <div class="np-toolbar">
          ${COLORS.map(c=>`<button type="button" class="np-dot" data-color="${c}" style="background:${c}"></button>`).join('')}
          <button type="button" class="np-clear">↺ Effacer le dessin</button>
        </div>
        <div class="np-canvas-wrap"><canvas></canvas></div>
        <div class="np-modal-actions">
          <button type="button" class="np-mbtn cancel">Annuler</button>
          <button type="button" class="np-mbtn ok">✔ Enregistrer</button>
        </div>
      </div>`;
    document.body.appendChild(ann);
    ann.querySelectorAll('.np-dot').forEach(d => d.onclick = () => setColor(d.dataset.color));
    ann.querySelector('.cancel').onclick = () => ann.classList.remove('show');
  }
  function setColor(c){
    annColor = c;
    ann.querySelectorAll('.np-dot').forEach(d => d.classList.toggle('active', d.dataset.color === c));
  }
  function openAnnotate(photo, onSave){
    if (!ann) buildAnnotate();
    const base = photo.orig || photo.src; // repart toujours de la photo d'origine
    const canvas = ann.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    let drawing = false, last = null;
    const pos = e => {
      const r = canvas.getBoundingClientRect();
      return { x:(e.clientX - r.left) * canvas.width / r.width, y:(e.clientY - r.top) * canvas.height / r.height };
    };
    const drawBase = (img) => { ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
    loadImage(base).then(img => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      drawBase(img);
      // On repart de la dernière annotation si elle existe
      if (photo.orig) loadImage(photo.src).then(drawBase);
      ann.querySelector('.np-clear').onclick = () => drawBase(img);
    });
    canvas.onpointerdown = e => { drawing = true; last = pos(e); canvas.setPointerCapture?.(e.pointerId); };
    canvas.onpointermove = e => {
      if (!drawing) return;
      const p = pos(e);
      ctx.strokeStyle = annColor;
      ctx.lineWidth = Math.max(3, canvas.width / 200);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p;
    };
    canvas.onpointerup = canvas.onpointercancel = canvas.onpointerleave = () => { drawing = false; };
    ann.querySelector('.ok').onclick = () => {
      onSave({ src: canvas.toDataURL('image/jpeg', 0.85), orig: base });
      ann.classList.remove('show');
    };
    setColor(annColor);
    ann.classList.add('show');
  }

  global.NeosPhotos = { card, src, norm };
})(window);
